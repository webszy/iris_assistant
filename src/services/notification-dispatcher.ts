import { and, asc, eq, lte, or, isNull, sql } from "drizzle-orm";
import type { Database } from "../db";
import { notificationDeliveries, type NotificationDeliveryRow } from "../db/schema";
import type { Env } from "../types/env";
import { nowEpochMs } from "../lib/time";
import { DELIVERY_ERROR_CODES, usableAdapterNames, type NotificationAdapters, type DeliveryResult } from "../providers/notification-channel";
import { getNotification } from "./notifications";
import { channelSelection, notificationLog } from "./notification-selection";

export const DELIVERY_POLICY = { maxAttempts: 5, leaseMs: 60_000, timeoutMs: 15_000,
  backoffMs: [60_000, 300_000, 900_000, 3_600_000] } as const;
const d = notificationDeliveries;

/** Attempts are reserved before network I/O, so repeated worker crashes cannot retry forever. */
async function claim(db: Database, id: string, now: number) {
  const token = crypto.randomUUID();
  const eligible = and(eq(d.id, id), eq(d.status, "pending"), lte(d.nextAttemptAt, now), or(isNull(d.claimExpiresAt), lte(d.claimExpiresAt, now)));
  const lease = { claimToken: token, claimExpiresAt: now + DELIVERY_POLICY.leaseMs, updatedAt: now };
  const [attempt] = await db.update(d).set({ ...lease, attemptCount: sql`${d.attemptCount}+1`, lastAttemptAt: now })
    .where(and(eligible, sql`${d.attemptCount}<${DELIVERY_POLICY.maxAttempts}`)).returning();
  if (attempt) return { row: attempt, send: true };
  // A crash on the last reserved attempt still needs a terminal transition/fallback.
  const [exhausted] = await db.update(d).set(lease)
    .where(and(eligible, sql`${d.attemptCount}>=${DELIVERY_POLICY.maxAttempts}`)).returning();
  return exhausted ? { row: exhausted, send: false } : null;
}
function safeResult(result: DeliveryResult): DeliveryResult {
  if (result.outcome === "sent") {
    const id = result.providerMessageId;
    return { outcome: "sent", ...(typeof id === "string" && /^[a-zA-Z0-9._:/-]{1,256}$/.test(id) ? { providerMessageId: id } : {}) };
  }
  return { outcome: result.outcome === "retryable" ? "retryable" : "terminal",
    code: DELIVERY_ERROR_CODES.includes(result.code) ? result.code : "PROVIDER_REJECTED",
    ...(Number.isInteger(result.providerStatus) && result.providerStatus! >= 100 && result.providerStatus! <= 599
      ? { providerStatus: result.providerStatus } : {}) };
}
async function send(db: Database, env: Env, adapters: NotificationAdapters, row: NotificationDeliveryRow, timeoutMs: number): Promise<DeliveryResult> {
  const adapter = adapters.get(row.channel);
  if (!adapter) return { outcome: "terminal", code: "ADAPTER_UNAVAILABLE" };
  if (!adapter.isUsable(env)) return { outcome: "terminal", code: "MISSING_RUNTIME_CONFIG" };
  const n = await getNotification(db, row.userId, row.notificationId);
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<DeliveryResult>(resolve => {
      timer = setTimeout(() => { resolve({ outcome: "retryable", code: "TIMEOUT" }); controller.abort(); }, timeoutMs);
    });
    const result = await Promise.race([adapter.send({ deliveryId: row.id, idempotencyKey: row.id,
      notificationId: n.id, userId: row.userId, title: n.title, body: n.body, sourceType: n.sourceType,
      sourceId: n.sourceId, sourceVersion: n.sourceVersion, sourceContext: n.sourceContext, signal: controller.signal }, env), timeout]);
    return safeResult(result);
  } catch {
    // Never store/log arbitrary exception strings or provider response bodies.
    return { outcome: "retryable", code: controller.signal.aborted ? "TIMEOUT" : "NETWORK_ERROR" };
  } finally { if (timer !== undefined) clearTimeout(timer); }
}
async function finish(db: Database, env: Env, adapters: NotificationAdapters, row: NotificationDeliveryRow, result: DeliveryResult, now: number) {
  const fence = and(eq(d.id, row.id), eq(d.userId, row.userId), eq(d.status, "pending"), eq(d.claimToken, row.claimToken!));
  if (result.outcome === "sent") {
    const rows = await db.update(d).set({ status: "sent", sentAt: now, nextAttemptAt: null,
      providerMessageId: result.providerMessageId ?? null, lastErrorCode: null, lastErrorMessage: null,
      claimToken: null, claimExpiresAt: null, updatedAt: now }).where(fence).returning({ id: d.id });
    return { committed: rows.length === 1, fallback: false };
  }
  if (result.outcome === "retryable" && row.attemptCount < DELIVERY_POLICY.maxAttempts) {
    const backoff = DELIVERY_POLICY.backoffMs[row.attemptCount - 1] ?? DELIVERY_POLICY.backoffMs[3];
    const rows = await db.update(d).set({ nextAttemptAt: now + backoff, lastErrorCode: result.code,
      lastErrorMessage: null, claimToken: null, claimExpiresAt: null, updatedAt: now }).where(fence).returning({ id: d.id });
    return { committed: rows.length === 1, fallback: false };
  }
  const selection = channelSelection(row.userId, usableAdapterNames(adapters, env), row.notificationId);
  const code = result.outcome === "retryable" ? "RETRY_EXHAUSTED" : result.code;
  // Keep the claim token until the final statement. A replay/stale worker cannot
  // create a backup after this commit, even if channels are enabled later.
  const results = await db.$client.batch([
    db.$client.prepare(`UPDATE notification_deliveries SET status='failed',next_attempt_at=NULL,last_error_code=?,last_error_message=NULL,updated_at=?
      WHERE id=? AND user_id=? AND status='pending' AND claim_token=?`).bind(code, now, row.id, row.userId, row.claimToken),
    db.$client.prepare(`INSERT INTO notification_deliveries(id,user_id,notification_id,channel,status,attempt_count,next_attempt_at,created_at,updated_at)
      SELECT ?,?,?,(${selection.sql}),'pending',0,?,?,?
      WHERE EXISTS (SELECT 1 FROM notification_deliveries WHERE id=? AND user_id=? AND status='failed' AND claim_token=?)
      AND NOT EXISTS (SELECT 1 FROM notification_deliveries WHERE notification_id=? AND status IN ('pending','sent'))
      AND EXISTS (${selection.sql})`)
      .bind(crypto.randomUUID(), row.userId, row.notificationId, ...selection.bindings, now, now, now,
        row.id, row.userId, row.claimToken, row.notificationId, ...selection.bindings),
    db.$client.prepare(`UPDATE notification_deliveries SET claim_token=NULL,claim_expires_at=NULL
      WHERE id=? AND user_id=? AND status='failed' AND claim_token=?`).bind(row.id, row.userId, row.claimToken),
  ]);
  return { committed: results[0]!.meta.changes === 1, fallback: results[1]!.meta.changes === 1 };
}

export async function runNotificationDispatcher(db: Database, env: Env, adapters: NotificationAdapters,
  options: { now?: number; limit?: number; timeoutMs?: number } = {}) {
  const now = options.now ?? nowEpochMs();
  const due = await db.select({ id: d.id }).from(d).where(and(eq(d.status, "pending"), lte(d.nextAttemptAt, now),
    or(isNull(d.claimExpiresAt), lte(d.claimExpiresAt, now))))
    .orderBy(asc(d.nextAttemptAt), asc(d.id)).limit(options.limit ?? 100);
  let attempted = 0, completed = 0, failed = 0;
  // Small bounded concurrency keeps provider timeouts within the scheduled run budget.
  let next = 0;
  async function worker() {
    while (next < due.length) {
      const id = due[next++]!.id;
      try {
        const lease = await claim(db, id, options.now ?? nowEpochMs());
        if (!lease) continue;
        const row = lease.row;
        if (lease.send) attempted++;
        const result: DeliveryResult = lease.send ? await send(db, env, adapters, row, options.timeoutMs ?? DELIVERY_POLICY.timeoutMs)
          : { outcome: "terminal", code: "RETRY_EXHAUSTED" };
        const finishedAt = options.now ?? nowEpochMs();
        const persisted = await finish(db, env, adapters, row, result, finishedAt);
        if (persisted.committed) completed++;
        notificationLog("delivery_result", { deliveryId: row.id, notificationId: row.notificationId, channel: row.channel,
          attemptNumber: row.attemptCount, outcome: result.outcome === "retryable" && row.attemptCount >= DELIVERY_POLICY.maxAttempts ? "terminal" : result.outcome,
          providerStatus: result.outcome === "sent" ? null : result.providerStatus ?? null,
          committed: persisted.committed, fallbackCreated: persisted.fallback });
      } catch {
        failed++;
        // Lease recovery retries failed persistence without leaking SQL or provider data.
        notificationLog("dispatcher_error", { deliveryId: id, reason: "INTERNAL_ERROR" });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(5, due.length) }, worker));
  return { selected: due.length, attempted, completed, failed };
}
