import { and, asc, eq, lte, sql } from "drizzle-orm";
import type { Database } from "../db";
import { reminderOccurrences, type ReminderOccurrenceRow } from "../db/schema";
import { ServiceError } from "../lib/service-error";
import { nowEpochMs } from "../lib/time";
import { ReminderMutation, prepareAdvance, requireReminder, requireOccurrence } from "./reminders";

export interface ReminderNotificationInput {
  userId: string; reminderId: string; occurrenceId: string;
  scheduleVersion: number; triggerVersion: number; triggerAt: number; scheduledFor: number;
  title: string; description: string | null; acceptedAt: number; idempotencyKey: string;
}
export interface ReminderAcceptancePlan {
  statements: D1PreparedStatement[];
  accepted: { sql: string; bindings: (string | number | null)[] };
  afterCommit?(): Promise<void>;
}
/** Same-D1 only: no external effects while preparing or committing acceptance. */
export interface ReminderNotificationAcceptance {
  eligibility?: { sql: string; bindings: string[] };
  prepare(db: D1Database, input: ReminderNotificationInput,
    guard: { sql: string; bindings: (string | number | null)[] }):
      D1PreparedStatement | ReminderAcceptancePlan | null | Promise<D1PreparedStatement | ReminderAcceptancePlan | null>;
}
function log(event: string, fields: Record<string, string | number | boolean> = {}) {
  console.info(JSON.stringify({ domain: "reminder", event, ...fields }));
}

export async function acceptReminderOccurrence(db: Database, expected: ReminderOccurrenceRow, sink: ReminderNotificationAcceptance, now: number): Promise<boolean> {
  for (let retry = 0; retry < 16; retry++) {
    const p = await requireReminder(db, expected.userId, expected.reminderId);
    const o = await requireOccurrence(db, expected.userId, expected.reminderId, expected.id);
    if (p.status !== "active" || p.scheduleVersion !== o.scheduleVersion || o.status !== "pending"
      || o.triggerVersion !== expected.triggerVersion || o.triggerAt !== expected.triggerAt || o.triggerAt > now) return false;
    const m = new ReminderMutation(db, p, now);
    const guard = { sql: `${m.predicate.sql} AND EXISTS (SELECT 1 FROM reminder_occurrences o JOIN reminders r ON r.id=o.reminder_id
      WHERE o.id=? AND o.user_id=? AND o.status='pending' AND o.trigger_version=? AND o.trigger_at=? AND o.trigger_at<=?
      AND r.status='active' AND r.schedule_version=o.schedule_version)`,
    bindings: [...m.predicate.bindings, o.id, o.userId, o.triggerVersion, o.triggerAt, now] };
    const payload: ReminderNotificationInput = { userId: p.userId, reminderId: p.id, occurrenceId: o.id,
      scheduleVersion: o.scheduleVersion, triggerVersion: o.triggerVersion, triggerAt: o.triggerAt, scheduledFor: o.scheduledFor,
      title: p.title, description: p.description, acceptedAt: now, idempotencyKey: `reminder-occurrence:${o.id}:trigger:${o.triggerVersion}` };
    const prepared = await sink.prepare(db.$client, payload, guard);
    if (prepared === null) return false;
    const plan = "statements" in prepared ? prepared : null;
    m.statements.push(...(plan ? plan.statements : [prepared as D1PreparedStatement]));
    // The assertion is fenced too. A no-op/partial acceptor rolls back the whole
    // batch; a lost parent CAS does nothing and retries against current state.
    const accepted = plan?.accepted ?? { sql: "changes()=1", bindings: [] };
    m.add(`UPDATE reminders SET schedule_version=CASE WHEN ${accepted.sql} THEN schedule_version ELSE 0 END WHERE id=? AND user_id=?`,
      [...accepted.bindings, p.id, p.userId]);
    m.add(`UPDATE reminder_occurrences SET status='triggered', trigger_count=trigger_count+1, last_triggered_at=?, updated_at=?
      WHERE id=? AND user_id=? AND status='pending' AND trigger_version=? AND trigger_at=?`,
    [now, now, o.id, o.userId, o.triggerVersion, o.triggerAt]);
    await prepareAdvance(m, o);
    if (await m.commit()) {
      // Observability must not turn a committed acceptance into a reported failure.
      try { await plan?.afterCommit?.(); } catch { log("acceptance_log_unavailable", { occurrenceId: o.id }); }
      log("handoff_success", { occurrenceId: o.id, reminderId: p.id, triggerVersion: o.triggerVersion });
      if (m.statements.length > 4) log("next_occurrence_generated", { reminderId: p.id, scheduleVersion: p.scheduleVersion });
      return true;
    }
  }
  throw new Error("Reminder acceptance contention");
}

/** Bounded poll; no sink means no claim, no state mutation, and no pretend acceptance. */
export async function runReminderScheduler(db: Database, sink?: ReminderNotificationAcceptance, now = nowEpochMs(), limit = 100) {
  log("scheduler_run", { integrationReady: sink !== undefined });
  if (!sink) {
    log("notification_integration_pending");
    return { selected: 0, accepted: 0, failed: 0, integrationPending: true };
  }
  // Stable pagination continues past blocked records within this run. The SQL
  // eligibility prefilter excludes users with no usable channels even when their
  // backlog exceeds the scan budget; those rows cannot starve eligible users.
  const pageSize = Math.max(1, Math.min(limit, 100));
  const scanBudget = Math.max(pageSize, 1000);
  const processBudget = Math.max(1, limit);
  let cursor: { triggerAt: number; id: string } | undefined;
  let selected = 0, accepted = 0, failed = 0;
  while (selected < scanBudget && accepted < processBudget) {
    const filters = [eq(reminderOccurrences.status, "pending"), lte(reminderOccurrences.triggerAt, now)];
    if (cursor) filters.push(sql`(${reminderOccurrences.triggerAt}, ${reminderOccurrences.id}) > (${cursor.triggerAt}, ${cursor.id})`);
    if (sink.eligibility) {
      // Bind values through Drizzle SQL; never interpolate identifiers supplied by a user.
      const pieces = sink.eligibility.sql.split("?");
      const condition = sql.empty();
      pieces.forEach((part, i) => { condition.append(sql.raw(part));
        if (i < sink.eligibility!.bindings.length) condition.append(sql`${sink.eligibility!.bindings[i]}`); });
      filters.push(condition);
    }
    const due = await db.select().from(reminderOccurrences).where(and(...filters))
      .orderBy(asc(reminderOccurrences.triggerAt), asc(reminderOccurrences.id)).limit(Math.min(pageSize, scanBudget - selected));
    if (due.length === 0) break;
    for (const o of due) {
      selected++;
      cursor = { triggerAt: o.triggerAt, id: o.id };
      log("trigger_attempt", { occurrenceId: o.id, reminderId: o.reminderId, triggerVersion: o.triggerVersion });
      try { if (await acceptReminderOccurrence(db, o, sink, now)) accepted++; }
      catch (error) {
        if (error instanceof ServiceError && (error.code === "NO_USABLE_NOTIFICATION_CHANNEL" || error.code === "NOTIFICATION_DISABLED")) continue;
        failed++;
        console.error(JSON.stringify({ domain: "reminder", event: "handoff_failure", occurrenceId: o.id, reminderId: o.reminderId }));
      }
      if (accepted >= processBudget) break;
    }
    if (due.length < pageSize) break;
  }
  log("due_count", { count: selected });
  return { selected, accepted, failed, integrationPending: false };
}
