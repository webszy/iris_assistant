import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { notificationFixture, resetNotifications, pauseNotificationBatch } from "./notification-fixture";
import { NOW } from "./reminder-fixture";
import { DELIVERY_POLICY, runNotificationDispatcher } from "../src/services/notification-dispatcher";
import { getNotification, patchNotificationChannel, putNotificationSettings } from "../src/services/notifications";
import { cancelReminder, handleOccurrence, patchReminder } from "../src/services/reminders";
import { classifyNotificationHttpFailure } from "../src/providers/notification-channel";
beforeEach(async () => { await resetNotifications(); vi.spyOn(Date, "now").mockReturnValue(NOW); vi.spyOn(console, "info").mockImplementation(() => {}); });
afterEach(() => vi.restoreAllMocks());
const terminal = { outcome: "terminal", code: "INVALID_DESTINATION" } as const;
describe("Notification delivery", () => {
  it("success snapshots, source context, safe provider id and sent timestamps", async () => {
    const f = await notificationFixture(); await f.accept();
    await patchReminder(f.db, f.userId, f.reminder.id, { title: "New title", description: "New body" });
    expect(await runNotificationDispatcher(f.db, env, f.adapters, { now: NOW })).toMatchObject({ attempted: 1, completed: 1 });
    const [d] = await f.deliveries();
    expect(d).toMatchObject({ status: "sent", attemptCount: 1, lastAttemptAt: NOW, sentAt: NOW, nextAttemptAt: null, providerMessageId: "test-message", claimToken: null });
    expect(f.adapters.get("primary")!.calls[0]).toMatchObject({ title: "锻炼", body: "Original message", idempotencyKey: d!.id, sourceContext: { reminderId: f.reminder.id } });
    expect(await getNotification(f.db, f.userId, d!.notificationId)).toMatchObject({ deliveryState: "delivered" });
    await runNotificationDispatcher(f.db, env, f.adapters, { now: NOW+86400000 });
    expect(await f.deliveries()).toHaveLength(1);
  });
  it("does not claim future attempts", async () => {
    const f = await notificationFixture(); await f.accept();
    await env.DB.prepare("UPDATE notification_deliveries SET next_attempt_at=? WHERE user_id=?").bind(NOW+60_000,f.userId).run();
    expect(await runNotificationDispatcher(f.db, env, f.adapters, { now: NOW })).toMatchObject({ attempted: 0 });
  });
  it.each(["TIMEOUT", "RATE_LIMITED", "PROVIDER_5XX", "NETWORK_ERROR"] as const)("%s retries the same delivery/idempotency key", async code => {
    const f = await notificationFixture(); await f.accept();
    const adapter = f.adapters.get("primary")!; adapter.results.push({ outcome: "retryable", code });
    await runNotificationDispatcher(f.db, env, f.adapters, { now: NOW });
    expect(await f.deliveries()).toMatchObject([{ status: "pending", attemptCount: 1, lastAttemptAt: NOW, nextAttemptAt: NOW+60_000, lastErrorCode: code }]);
    await runNotificationDispatcher(f.db, env, f.adapters, { now: NOW+60_000 });
    expect(adapter.calls.map(c => c.idempotencyKey)).toEqual([adapter.calls[0]!.deliveryId,adapter.calls[0]!.deliveryId]);
    expect(await f.deliveries()).toMatchObject([{ status: "sent", attemptCount: 2 }]);
  });
  it.each([429, 500, 502, 503, 504, 408])("classifies HTTP %s as retryable", status => {
    expect(classifyNotificationHttpFailure(status).outcome).toBe("retryable");
  });
  it.each([400, 401, 403, 404, 422])("classifies HTTP %s as terminal", status => {
    expect(classifyNotificationHttpFailure(status).outcome).toBe("terminal");
  });
  it("enforces an actual timeout, aborts input and never marks an unknown outcome sent", async () => {
    const f = await notificationFixture(); await f.accept();
    f.adapters.get("primary")!.handler = () => new Promise(() => {});
    await runNotificationDispatcher(f.db, env, f.adapters, { now: NOW, timeoutMs: 5 });
    expect(f.adapters.get("primary")!.calls[0]!.signal.aborted).toBe(true);
    expect(await f.deliveries()).toMatchObject([{ status: "pending", lastErrorCode: "TIMEOUT" }]);
  });
  it("retry exhaustion creates one lazy backup", async () => {
    const f = await notificationFixture(); await f.accept();
    const adapter = f.adapters.get("primary")!;
    adapter.handler = async () => ({ outcome: "retryable", code: "TIMEOUT" });
    let now = NOW;
    for (let i=0;i<DELIVERY_POLICY.maxAttempts;i++) {
      await runNotificationDispatcher(f.db, env, f.adapters, { now });
      now += DELIVERY_POLICY.backoffMs[i] ?? 3_600_000;
    }
    const rows = await f.deliveries();
    expect(rows.find(d => d.channel === "primary")).toMatchObject({ status: "failed", attemptCount: 5, lastErrorCode: "RETRY_EXHAUSTED", nextAttemptAt: null });
    expect(rows.filter(d => d.status === "pending")).toMatchObject([{ channel: "backup", attemptCount: 0 }]);
  });
  it("terminal failures follow current priorities, keep history, stop on sent", async () => {
    const f = await notificationFixture(); await f.accept();
    await patchNotificationChannel(f.db, f.userId, f.config[2]!.id, { priority: 1 });
    f.adapters.get("primary")!.results.push(terminal);
    f.adapters.get("last")!.results.push(terminal);
    await runNotificationDispatcher(f.db, env, f.adapters, { now: NOW });
    expect((await f.deliveries()).filter(d => d.status === "pending")).toMatchObject([{ channel: "last" }]);
    await runNotificationDispatcher(f.db, env, f.adapters, { now: NOW });
    expect((await f.deliveries()).filter(d => d.status === "pending")).toMatchObject([{ channel: "backup" }]);
    await runNotificationDispatcher(f.db, env, f.adapters, { now: NOW });
    expect((await f.deliveries()).map(d => d.status).sort()).toEqual(["failed","failed","sent"]);
    expect(await getNotification(f.db, f.userId, (await f.notifications())[0]!.id)).toMatchObject({ deliveryState: "delivered" });
  });
  it.each(["disabled", "missing_adapter", "missing_config"])("fallback skips %s backup", async mode => {
    const f = await notificationFixture(); await f.accept();
    if (mode === "disabled") await patchNotificationChannel(f.db, f.userId, f.config[1]!.id, { enabled: false });
    if (mode === "missing_adapter") f.adapters.delete("backup");
    if (mode === "missing_config") f.adapters.get("backup")!.usable = false;
    f.adapters.get("primary")!.results.push(terminal);
    await runNotificationDispatcher(f.db, env, f.adapters, { now: NOW });
    expect((await f.deliveries()).filter(d => d.status === "pending")).toMatchObject([{ channel: "last" }]);
  });
  it("all failed derives failed permanently after later channel enable", async () => {
    const f = await notificationFixture(); await f.accept();
    for (const a of f.adapters.values()) a.results.push(terminal);
    for (let i=0;i<3;i++) await runNotificationDispatcher(f.db, env, f.adapters, { now: NOW });
    const n = (await f.notifications())[0]!;
    expect(await getNotification(f.db, f.userId, n.id)).toMatchObject({ deliveryState: "failed" });
    // New, untried channel is deliberately inserted as persisted config; no historical scan.
    await env.DB.prepare("INSERT INTO notification_channels(id,user_id,channel,enabled,priority,created_at,updated_at) VALUES(?,?,'new',1,0,?,?)")
      .bind(crypto.randomUUID(),f.userId,NOW,NOW).run();
    f.adapters.set("new", f.adapters.get("last")!);
    await runNotificationDispatcher(f.db, env, f.adapters, { now: NOW+86400000 });
    expect(await f.deliveries()).toHaveLength(3);
    expect(await getNotification(f.db, f.userId, n.id)).toMatchObject({ deliveryState: "failed" });
  });
  it.each(["channel", "settings"])("later %s disable does not stop existing delivery retries", async mode => {
    const f = await notificationFixture(); await f.accept();
    f.adapters.get("primary")!.results.push({ outcome: "retryable", code: "TIMEOUT" });
    if (mode === "channel") await patchNotificationChannel(f.db, f.userId, f.config[0]!.id, { enabled: false });
    else await putNotificationSettings(f.db, f.userId, { enabled: false });
    await runNotificationDispatcher(f.db, env, f.adapters, { now: NOW });
    await runNotificationDispatcher(f.db, env, f.adapters, { now: NOW+60_000 });
    expect(await f.deliveries()).toMatchObject([{ status: "sent", attemptCount: 2 }]);
  });
  it("disabled settings block new fallback", async () => {
    const f = await notificationFixture(); await f.accept(); await putNotificationSettings(f.db, f.userId, { enabled: false });
    f.adapters.get("primary")!.results.push(terminal);
    await runNotificationDispatcher(f.db, env, f.adapters, { now: NOW });
    expect(await f.deliveries()).toMatchObject([{ status: "failed" }]);
  });
  it.each(["missing_adapter", "missing_config"])("existing delivery %s becomes terminal and falls back", async mode => {
    const f = await notificationFixture(); await f.accept();
    if (mode === "missing_adapter") f.adapters.delete("primary"); else f.adapters.get("primary")!.usable = false;
    await runNotificationDispatcher(f.db, env, f.adapters, { now: NOW });
    expect((await f.deliveries()).find(d => d.channel === "primary")).toMatchObject({ status: "failed" });
    expect((await f.deliveries()).filter(d => d.status === "pending")).toMatchObject([{ channel: "backup" }]);
  });
  it.each(["done", "skipped", "cancel", "reschedule", "delay"] as const)("%s after acceptance preserves delivery and fallback", async action => {
    const f = await notificationFixture(); await f.accept();
    if (action === "cancel") await cancelReminder(f.db, f.userId, f.reminder.id);
    else if (action === "reschedule") await patchReminder(f.db, f.userId, f.reminder.id, { starts_at: new Date(NOW+86400000).toISOString() });
    else await handleOccurrence(f.db, f.userId, f.reminder.id, f.occurrence.id, action, new Date(NOW+60_000).toISOString());
    f.adapters.get("primary")!.results.push({ outcome: "retryable", code: "TIMEOUT" },terminal);
    await runNotificationDispatcher(f.db, env, f.adapters, { now: NOW });
    await runNotificationDispatcher(f.db, env, f.adapters, { now: NOW+60_000 });
    expect(await f.notifications()).toHaveLength(1);
    expect((await f.deliveries()).filter(d => d.status === "pending")).toMatchObject([{ channel: "backup" }]);
  });
  it("concurrent dispatchers claim/send/fallback once", async () => {
    const f = await notificationFixture(); await f.accept(); f.adapters.get("primary")!.results.push(terminal);
    await Promise.all([runNotificationDispatcher(f.db,env,f.adapters,{now:NOW}),runNotificationDispatcher(f.db,env,f.adapters,{now:NOW})]);
    expect(f.adapters.get("primary")!.calls).toHaveLength(1);
    const rows = await f.deliveries(); expect(rows.filter(d => d.channel === "backup")).toHaveLength(1);
    expect(rows.filter(d => d.status === "pending").length).toBeLessThanOrEqual(1);
  });
  it("fallback insertion failure rolls back failed transition and recovers after lease expiry", async () => {
    const f = await notificationFixture(); await f.accept(); f.adapters.get("primary")!.handler = async () => terminal;
    await env.DB.exec("CREATE TRIGGER fallback_failure BEFORE INSERT ON notification_deliveries BEGIN SELECT RAISE(ABORT,'test'); END;");
    try { expect(await runNotificationDispatcher(f.db,env,f.adapters,{now:NOW})).toMatchObject({ failed: 1 }); }
    finally { await env.DB.exec("DROP TRIGGER fallback_failure"); }
    expect(await f.deliveries()).toMatchObject([{ status: "pending", attemptCount: 1 }]);
    await runNotificationDispatcher(f.db,env,f.adapters,{now:NOW+DELIVERY_POLICY.leaseMs});
    expect((await f.deliveries()).filter(d => d.status === "pending")).toMatchObject([{ channel: "backup" }]);
  });
  it("expired final-attempt lease terminates without sending again", async () => {
    const f = await notificationFixture(); await f.accept();
    await env.DB.prepare("UPDATE notification_deliveries SET attempt_count=5,claim_token='crashed',claim_expires_at=? WHERE user_id=?").bind(NOW,f.userId).run();
    await runNotificationDispatcher(f.db,env,f.adapters,{now:NOW});
    expect(f.adapters.get("primary")!.calls).toHaveLength(0);
    expect((await f.deliveries()).find(d => d.channel === "primary")).toMatchObject({ status: "failed", attemptCount: 5, lastErrorCode: "RETRY_EXHAUSTED" });
  });
  it("late result from an expired lease cannot overwrite a newer sent result or start fallback", async () => {
    const f = await notificationFixture(); await f.accept();
    let release!: (value: typeof terminal) => void;
    let entered!: () => void;
    const ready = new Promise<void>(resolve => { entered=resolve; });
    const adapter = f.adapters.get("primary")!;
    adapter.handler = () => { entered(); return new Promise(resolve => { release=resolve; }); };
    const first = runNotificationDispatcher(f.db,env,f.adapters,{now:NOW});
    await ready;
    adapter.handler = async () => ({ outcome: "sent" });
    await runNotificationDispatcher(f.db,env,f.adapters,{now:NOW+DELIVERY_POLICY.leaseMs});
    release(terminal); await first;
    expect(await f.deliveries()).toMatchObject([{ status: "sent", attemptCount: 2 }]);
  });
  it("fallback selection sees settings committed before its batch", async () => {
    const f = await notificationFixture(); await f.accept(); f.adapters.get("primary")!.results.push(terminal);
    const paused = pauseNotificationBatch();
    const task = runNotificationDispatcher(paused.db,env,f.adapters,{now:NOW});
    await Promise.race([paused.ready,task.then(() => { throw new Error("Missing batch"); })]);
    try { await putNotificationSettings(f.db,f.userId,{enabled:false}); } finally { paused.release(); }
    await task; expect(await f.deliveries()).toMatchObject([{ status: "failed" }]);
  });
  it("raw provider errors never enter persistence or logs", async () => {
    const logSpy = vi.spyOn(console,"info").mockImplementation(() => {});
    const f = await notificationFixture(); await f.accept();
    f.adapters.get("primary")!.handler = async () => { throw new Error("Authorization secret-token private-response"); };
    await runNotificationDispatcher(f.db,env,f.adapters,{now:NOW});
    expect(JSON.stringify(await f.deliveries())).not.toContain("secret-token");
    expect(JSON.stringify(logSpy.mock.calls)).not.toContain("secret-token");
    expect(await f.deliveries()).toMatchObject([{ lastErrorCode: "NETWORK_ERROR", lastErrorMessage: null }]);
  });
  it("DB enforces both per-channel uniqueness and one pending invariant", async () => {
    const f = await notificationFixture(); await f.accept();
    const n = (await f.notifications())[0]!;
    for (const channel of ["primary","backup"]) await expect(env.DB.prepare(`INSERT INTO notification_deliveries(id,user_id,notification_id,channel,next_attempt_at,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),f.userId,n.id,channel,NOW,NOW,NOW).run()).rejects.toThrow();
  });
});
