import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDb } from "../src/db";
import { acceptReminderOccurrence, runReminderScheduler, type ReminderNotificationAcceptance } from "../src/services/reminder-scheduler";
import { cancelReminder, getReminder, handleOccurrence, patchReminder } from "../src/services/reminders";
import { reminderFixture, testAcceptance, resetReminders, events, NOW } from "./reminder-fixture";
beforeEach(async () => {
  await resetReminders();
  vi.spyOn(Date, "now").mockReturnValue(NOW);
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

/** Pause outside the real transaction, never inject an impossible mid-batch interleave. */
function pauseBatch() {
  let release!: () => void;
  let reached!: () => void;
  const ready = new Promise<void>(r => { reached = r; });
  const resume = new Promise<void>(r => { release = r; });
  let paused = false;
  const binding = new Proxy(env.DB, { get(target, property) {
    if (property === "batch") return async (statements: D1PreparedStatement[]) => {
      if (!paused) { paused = true; reached(); await resume; }
      return target.batch(statements);
    };
    const value = Reflect.get(target, property, target);
    return typeof value === "function" ? value.bind(target) : value;
  } });
  return { db: createDb(binding), ready, release };
}
async function waitForBatch(ready: Promise<void>, task: Promise<unknown>) {
  await Promise.race([ready, task.then(() => { throw new Error("Missing transaction boundary"); })]);
}

describe("Reminder durable acceptance and downtime", () => {
  it("without production integration leaves all pending unchanged", async () => {
    const f = await reminderFixture();
    expect(await runReminderScheduler(f.db)).toMatchObject({ integrationPending: true, accepted: 0 });
    expect((await f.raw()).status).toBe("pending");
    expect((await f.raw()).triggerCount).toBe(0);
  });
  it("selects due only, persists context, increments once, and retries don't duplicate", async () => {
    const logSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const f = await reminderFixture({ description: "private display text" });
    const future = await reminderFixture({ starts_at: "2026-09-24T00:00:00Z" });
    const sink = await testAcceptance();
    expect(await runReminderScheduler(f.db, sink, NOW)).toMatchObject({ selected: 1, accepted: 1 });
    expect(await runReminderScheduler(f.db, sink, NOW)).toMatchObject({ selected: 0, accepted: 0 });
    expect((await f.raw()).triggerCount).toBe(1);
    expect((await future.raw()).status).toBe("pending");
    const rows = await events();
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0]!.payload)).toMatchObject({ userId: f.userId, reminderId: f.reminder.id, occurrenceId: f.occurrence.id,
      title: "锻炼", description: "private display text", triggerVersion: 1, idempotencyKey: `reminder-occurrence:${f.occurrence.id}:trigger:1` });
    expect(JSON.stringify(logSpy.mock.calls)).not.toContain("private display text");
  });
  it("a no-op acceptance cannot pretend durable success", async () => {
    const f = await reminderFixture();
    await testAcceptance();
    const sink: ReminderNotificationAcceptance = { prepare: db => db.prepare("INSERT INTO test_reminder_events SELECT 'unused',1,'{}' WHERE 0") };
    expect(await runReminderScheduler(f.db, sink, NOW)).toMatchObject({ failed: 1, accepted: 0 });
    expect((await f.raw()).status).toBe("pending");
    expect((await f.raw()).triggerCount).toBe(0);
    expect(await events()).toHaveLength(0);
  });
  it("failed event insertion keeps pending and retries the same identity", async () => {
    const f = await reminderFixture();
    const real = await testAcceptance();
    const keys: string[] = [];
    const bad: ReminderNotificationAcceptance = { prepare: (db, input) => {
      keys.push(input.idempotencyKey);
      return db.prepare("INSERT INTO no_such_notification_table VALUES (1)");
    } };
    expect(await runReminderScheduler(f.db, bad, NOW)).toMatchObject({ failed: 1, accepted: 0 });
    expect((await f.raw()).status).toBe("pending");
    const good: ReminderNotificationAcceptance = { prepare: (db, input, guard) => { keys.push(input.idempotencyKey); return real.prepare(db, input, guard); } };
    expect(await runReminderScheduler(f.db, good, NOW)).toMatchObject({ accepted: 1 });
    expect(new Set(keys).size).toBe(1);
    expect(await events()).toHaveLength(1);
  });
  it.each(["state", "frontier"])("failure in %s rolls back the event and occurrence together", async mode => {
    const f = await reminderFixture({ rrule: "FREQ=DAILY" });
    const sink = await testAcceptance();
    const query = mode === "state"
      ? "CREATE TRIGGER fail_transition BEFORE UPDATE ON reminder_occurrences WHEN NEW.status='triggered' BEGIN SELECT RAISE(ABORT,'test'); END;"
      : "CREATE TRIGGER fail_transition BEFORE INSERT ON reminder_occurrences BEGIN SELECT RAISE(ABORT,'test'); END;";
    await env.DB.exec(query);
    try {
      expect(await runReminderScheduler(f.db, sink, NOW)).toMatchObject({ accepted: 0, failed: 1 });
      expect(await events()).toHaveLength(0);
      expect((await f.raw()).status).toBe("pending");
      expect((await f.raw()).triggerCount).toBe(0);
      expect(await f.list()).toHaveLength(1);
    } finally { await env.DB.exec("DROP TRIGGER fail_transition"); }
    expect(await runReminderScheduler(f.db, sink, NOW)).toMatchObject({ accepted: 1 });
    expect(await events()).toHaveLength(1);
  });
  it("processes one existing overdue recurrence, jumps over ungenerated backlog, keeps overdue one-time", async () => {
    const f = await reminderFixture({ starts_at: "2026-09-20T12:00:00Z", rrule: "FREQ=DAILY" });
    const one = await reminderFixture({ starts_at: "2026-09-20T12:00:00Z" });
    const sink = await testAcceptance();
    expect(await runReminderScheduler(f.db, sink, NOW)).toMatchObject({ accepted: 2 });
    expect((await f.list()).map(o => o.scheduledFor)).toEqual(["2026-09-20T12:00:00.000Z", "2026-09-23T12:00:00.000Z"]);
    expect((await one.raw()).status).toBe("triggered");
  });
  it("doesn't drop multiple already generated delayed occurrences during downtime", async () => {
    const f = await reminderFixture({ rrule: "FREQ=DAILY" });
    const sink = await testAcceptance();
    await runReminderScheduler(f.db, sink, NOW);
    await handleOccurrence(f.db, f.userId, f.reminder.id, f.occurrence.id, "delay", "2026-09-24T01:00:00Z");
    expect(await runReminderScheduler(f.db, sink, NOW + 5 * 86400000)).toMatchObject({ accepted: 2 });
    const rows = await f.list();
    expect(rows.filter(o => o.status === "triggered")).toHaveLength(2);
    expect(rows.filter(o => o.status === "pending")).toHaveLength(1);
    expect(rows.find(o => o.status === "pending")?.scheduledFor).toBe("2026-09-29T00:00:00.000Z");
  });
});

describe("D1 commit ordering fences stale acceptance", () => {
  it.each(["done", "skipped", "cancel", "reschedule", "delay"] as const)("%s commits before acceptance: no stale event", async action => {
    const f = await reminderFixture({ rrule: "FREQ=DAILY" });
    const sink = await testAcceptance();
    const b = pauseBatch();
    const attempt = acceptReminderOccurrence(b.db, await f.raw(), sink, NOW);
    await waitForBatch(b.ready, attempt);
    try {
      if (action === "cancel") await cancelReminder(f.db, f.userId, f.reminder.id);
      else if (action === "reschedule") await patchReminder(f.db, f.userId, f.reminder.id, { starts_at: "2026-09-25T00:00:00Z" });
      else await handleOccurrence(f.db, f.userId, f.reminder.id, f.occurrence.id, action, "2026-09-24T00:00:00Z");
    } finally { b.release(); }
    expect(await attempt).toBe(false);
    expect(await events()).toHaveLength(0);
    expect((await f.raw()).triggerCount).toBe(0);
  });
  it("ABA delay prevents an old A generation from being accepted", async () => {
    const f = await reminderFixture({ starts_at: "2026-09-24T00:00:00Z" });
    const old = await f.raw();
    const sink = await testAcceptance();
    await handleOccurrence(f.db, f.userId, f.reminder.id, f.occurrence.id, "delay", "2026-09-25T00:00:00Z");
    await handleOccurrence(f.db, f.userId, f.reminder.id, f.occurrence.id, "delay", "2026-09-24T00:00:00Z");
    expect(await acceptReminderOccurrence(f.db, old, sink, NOW + 86400000)).toBe(false);
    expect(await runReminderScheduler(f.db, sink, NOW + 86400000)).toMatchObject({ accepted: 1 });
    expect((await events())[0]?.trigger_version).toBe(3);
  });
  it("acceptance commits before stale DELAY: retry preserves accepted event/count and creates a new generation", async () => {
    const f = await reminderFixture({ rrule: "FREQ=DAILY" });
    const b = pauseBatch();
    const action = handleOccurrence(b.db, f.userId, f.reminder.id, f.occurrence.id, "delay", "2026-09-24T01:00:00Z");
    await waitForBatch(b.ready, action);
    try { await runReminderScheduler(f.db, await testAcceptance(), NOW); }
    finally { b.release(); }
    expect(await action).toMatchObject({ status: "pending", triggerCount: 1, triggerVersion: 2 });
    expect(await events()).toHaveLength(1);
    expect(await f.list()).toHaveLength(2);
  });
  it("concurrent schedulers accept once and create exactly one next occurrence", async () => {
    const f = await reminderFixture({ rrule: "FREQ=DAILY" });
    const sink = await testAcceptance();
    const expected = await f.raw();
    const b = pauseBatch();
    const first = acceptReminderOccurrence(b.db, expected, sink, NOW);
    await waitForBatch(b.ready, first);
    try { expect(await acceptReminderOccurrence(f.db, expected, sink, NOW)).toBe(true); }
    finally { b.release(); }
    expect(await first).toBe(false);
    expect(await events()).toHaveLength(1);
    expect(await f.list()).toHaveLength(2);
  });
  it("concurrent DONE and reschedule retry safely without old-version advancement", async () => {
    const f = await reminderFixture({ rrule: "FREQ=DAILY" });
    await runReminderScheduler(f.db, await testAcceptance(), NOW);
    const b = pauseBatch();
    const action = handleOccurrence(b.db, f.userId, f.reminder.id, f.occurrence.id, "done");
    await waitForBatch(b.ready, action);
    try { await patchReminder(f.db, f.userId, f.reminder.id, { starts_at: "2026-09-26T00:00:00Z" }); }
    finally { b.release(); }
    expect(await action).toMatchObject({ status: "done", scheduleVersion: 1 });
    expect(await f.list()).toHaveLength(3);
    expect(await getReminder(f.db, f.userId, f.reminder.id)).toMatchObject({ scheduleVersion: 2, nextTriggerAt: "2026-09-26T00:00:00.000Z" });
  });
});
