import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { reminderOccurrences } from "../src/db/schema";
import { createDb } from "../src/db";
import { createReminder, getReminder, patchReminder, cancelReminder, handleOccurrence, listReminders, listOccurrences, getOccurrence } from "../src/services/reminders";
import { runReminderScheduler } from "../src/services/reminder-scheduler";
import { createProject } from "../src/services/projects";
import { seedIdentity } from "./helpers";
import { reminderFixture, testAcceptance, resetReminders, NOW } from "./reminder-fixture";
beforeEach(async () => {
  await resetReminders(); vi.spyOn(Date, "now").mockReturnValue(NOW); vi.spyOn(console, "info").mockImplementation(() => {}); });
afterEach(() => vi.restoreAllMocks());
const code = (value: Promise<unknown>, expected: string) => expect(value).rejects.toMatchObject({ code: expected });

describe("Reminder create/read and ownership", () => {
  it("atomically creates a past-due first occurrence and derives nextTriggerAt", async () => {
    const f = await reminderFixture({ starts_at: "2026-09-20T08:00:00+08:00", rrule: "FREQ=DAILY" });
    expect(f.reminder).toMatchObject({ status: "active", projectId: null, scheduleVersion: 1, nextTriggerAt: "2026-09-20T00:00:00.000Z" });
    expect(f.occurrence).toMatchObject({ status: "pending", triggerVersion: 1, triggerCount: 0, scheduledFor: f.reminder.startsAt, triggerAt: f.reminder.startsAt });
    expect(f.reminder).not.toHaveProperty("mutationToken");
  });
  it("rolls back definition if first occurrence insertion fails", async () => {
    const user = await seedIdentity();
    await env.DB.exec("CREATE TRIGGER fail_occurrence BEFORE INSERT ON reminder_occurrences BEGIN SELECT RAISE(ABORT,'test'); END;");
    try {
      await expect(createReminder(createDb(env.DB), user.userId, { title: "fail", starts_at: "2026-09-23T00:00:00Z", timezone: "UTC" })).rejects.toThrow();
      expect(await listReminders(createDb(env.DB), user.userId, {})).toEqual([]);
    } finally { await env.DB.exec("DROP TRIGGER fail_occurrence"); }
  });
  it("validates optional Project and user/nested scopes without revealing other users", async () => {
    const f = await reminderFixture();
    const other = await reminderFixture();
    const project = await createProject(f.db, f.userId, { name: "p", slug: "p" });
    expect((await patchReminder(f.db, f.userId, f.reminder.id, { project_id: project.id })).projectId).toBe(project.id);
    await code(patchReminder(f.db, other.userId, other.reminder.id, { project_id: project.id }), "PROJECT_NOT_FOUND");
    await code(getReminder(f.db, other.userId, f.reminder.id), "REMINDER_NOT_FOUND");
    await code(getOccurrence(f.db, other.userId, other.reminder.id, f.occurrence.id), "REMINDER_OCCURRENCE_NOT_FOUND");
    await code(handleOccurrence(f.db, other.userId, f.reminder.id, f.occurrence.id, "done"), "REMINDER_NOT_FOUND");
    expect(await listReminders(f.db, other.userId, {})).toHaveLength(1);
    expect((await patchReminder(f.db, f.userId, f.reminder.id, { project_id: null })).projectId).toBeNull();
  });
  it("filters occurrence time by scheduledFor, inclusive, not delayed triggerAt", async () => {
    const f = await reminderFixture();
    await handleOccurrence(f.db, f.userId, f.reminder.id, f.occurrence.id, "delay", "2026-09-25T00:00:00Z");
    expect(await listOccurrences(f.db, f.userId, f.reminder.id, { from: "2026-09-23T00:00:00Z", to: "2026-09-23T00:00:00Z" })).toHaveLength(1);
    expect(await listOccurrences(f.db, f.userId, f.reminder.id, { from: "2026-09-25T00:00:00Z" })).toEqual([]);
  });
});

describe("Occurrence terminal actions and completion", () => {
  it.each(["done", "skipped"] as const)("one-time pending → %s completes, repeats preserve handledAt", async action => {
    const f = await reminderFixture();
    const handled = await handleOccurrence(f.db, f.userId, f.reminder.id, f.occurrence.id, action);
    expect(handled).toMatchObject({ status: action, handledAt: new Date(NOW).toISOString() });
    vi.mocked(Date.now).mockReturnValue(NOW + 1000);
    expect(await handleOccurrence(f.db, f.userId, f.reminder.id, f.occurrence.id, action)).toEqual(handled);
    expect((await getReminder(f.db, f.userId, f.reminder.id)).status).toBe("completed");
    await code(handleOccurrence(f.db, f.userId, f.reminder.id, f.occurrence.id, "delay", "2026-09-24T00:00:00Z"), "INVALID_OCCURRENCE_STATE");
    await code(handleOccurrence(f.db, f.userId, f.reminder.id, f.occurrence.id, action === "done" ? "skipped" : "done"), "INVALID_OCCURRENCE_STATE");
  });
  it.each(["done", "skipped"] as const)("advance from a future %s strictly after scheduledFor", async action => {
    const f = await reminderFixture({ starts_at: "2026-09-25T00:00:00Z", rrule: "FREQ=DAILY;COUNT=2" });
    await handleOccurrence(f.db, f.userId, f.reminder.id, f.occurrence.id, action);
    const rows = await f.list();
    expect(rows.map(r => r.scheduledFor)).toEqual(["2026-09-25T00:00:00.000Z", "2026-09-26T00:00:00.000Z"]);
    expect((await getReminder(f.db, f.userId, f.reminder.id)).status).toBe("active");
    await handleOccurrence(f.db, f.userId, f.reminder.id, rows[1]!.id, action);
    expect((await getReminder(f.db, f.userId, f.reminder.id)).status).toBe("completed");
  });
  it.each([null, "FREQ=DAILY;COUNT=1", "FREQ=DAILY;UNTIL=20260923T000000Z"])("final trigger stays active, permits DELAY, completes only when handled: %s", async rrule => {
    const f = await reminderFixture({ rrule });
    const sink = await testAcceptance();
    await runReminderScheduler(f.db, sink, NOW);
    expect(await getReminder(f.db, f.userId, f.reminder.id)).toMatchObject({ status: "active", nextTriggerAt: null, completedAt: null });
    await handleOccurrence(f.db, f.userId, f.reminder.id, f.occurrence.id, "delay", "2026-09-24T00:00:00Z");
    await runReminderScheduler(f.db, sink, NOW + 86400000);
    expect((await f.raw()).triggerCount).toBe(2);
    await handleOccurrence(f.db, f.userId, f.reminder.id, f.occurrence.id, "done");
    expect((await getReminder(f.db, f.userId, f.reminder.id)).status).toBe("completed");
  });
  it("historical DONE never advances again when a later occurrence exists", async () => {
    const f = await reminderFixture({ rrule: "FREQ=DAILY" });
    await runReminderScheduler(f.db, await testAcceptance(), NOW);
    vi.mocked(Date.now).mockReturnValue(NOW + 5 * 86400000);
    await handleOccurrence(f.db, f.userId, f.reminder.id, f.occurrence.id, "done");
    expect(await f.list()).toHaveLength(2);
  });
});

describe("DELAY and version evolution", () => {
  it("preserves identity/count/definition, allows overlap and increments generation only on change", async () => {
    const f = await reminderFixture({ rrule: "FREQ=DAILY" });
    await runReminderScheduler(f.db, await testAcceptance(), NOW);
    const delayed = await handleOccurrence(f.db, f.userId, f.reminder.id, f.occurrence.id, "delay", "2026-09-24T02:00:00Z");
    expect(delayed).toMatchObject({ status: "pending", scheduledFor: f.occurrence.scheduledFor, triggerVersion: 2, triggerCount: 1, lastTriggeredAt: new Date(NOW).toISOString() });
    const before = await f.list();
    expect(before).toHaveLength(2);
    expect(before.filter(o => o.status === "pending")).toHaveLength(2);
    expect(await getReminder(f.db, f.userId, f.reminder.id)).toMatchObject({ startsAt: f.reminder.startsAt, rrule: "FREQ=DAILY", nextTriggerAt: "2026-09-24T00:00:00.000Z" });
    expect(await handleOccurrence(f.db, f.userId, f.reminder.id, f.occurrence.id, "delay", "2026-09-24T02:00:00Z")).toEqual(delayed);
    expect(await f.list()).toEqual(before);
  });
  it("rejects past/equal delay and handles A → B → A as distinct execution generations", async () => {
    const f = await reminderFixture({ starts_at: "2026-09-24T00:00:00Z" });
    await code(handleOccurrence(f.db, f.userId, f.reminder.id, f.occurrence.id, "delay", new Date(NOW).toISOString()), "INVALID_DELAY_TIME");
    await handleOccurrence(f.db, f.userId, f.reminder.id, f.occurrence.id, "delay", "2026-09-25T00:00:00Z");
    await handleOccurrence(f.db, f.userId, f.reminder.id, f.occurrence.id, "delay", "2026-09-24T00:00:00Z");
    expect((await f.raw()).triggerVersion).toBe(3);
  });
  it("reschedule A → B → A preserves historical identity and increments only material schedule changes", async () => {
    const f = await reminderFixture({ starts_at: "2026-09-24T00:00:00Z", rrule: "FREQ=DAILY" });
    await patchReminder(f.db, f.userId, f.reminder.id, { title: "New", description: "desc" });
    expect(await f.list()).toEqual([f.occurrence]);
    await patchReminder(f.db, f.userId, f.reminder.id, { rrule: "INTERVAL=1;FREQ=DAILY" });
    expect((await getReminder(f.db, f.userId, f.reminder.id)).scheduleVersion).toBe(1);
    await patchReminder(f.db, f.userId, f.reminder.id, { starts_at: "2026-09-25T00:00:00Z" });
    await patchReminder(f.db, f.userId, f.reminder.id, { starts_at: "2026-09-24T00:00:00Z" });
    expect((await getReminder(f.db, f.userId, f.reminder.id)).scheduleVersion).toBe(3);
    const rows = await f.list();
    expect(rows).toHaveLength(3);
    expect(rows.filter(o => o.scheduledFor === f.occurrence.scheduledFor).map(o => o.scheduleVersion)).toEqual([1, 3]);
    expect(rows.find(o => o.scheduleVersion === 1)?.status).toBe("cancelled");
  });
  it("reschedule cancels overdue and delayed pending, preserves triggered history for DONE/SKIP only", async () => {
    const f = await reminderFixture({ rrule: "FREQ=DAILY" });
    await runReminderScheduler(f.db, await testAcceptance(), NOW);
    await patchReminder(f.db, f.userId, f.reminder.id, { starts_at: "2026-09-20T00:00:00Z", rrule: "FREQ=DAILY;COUNT=1" });
    expect(await getReminder(f.db, f.userId, f.reminder.id)).toMatchObject({ status: "active", nextTriggerAt: null });
    await code(handleOccurrence(f.db, f.userId, f.reminder.id, f.occurrence.id, "delay", "2026-09-25T00:00:00Z"), "INVALID_OCCURRENCE_STATE");
    await handleOccurrence(f.db, f.userId, f.reminder.id, f.occurrence.id, "done");
    expect((await getReminder(f.db, f.userId, f.reminder.id)).status).toBe("completed");
    expect(await f.list()).toHaveLength(2);
    await code(patchReminder(f.db, f.userId, f.reminder.id, { starts_at: "2026-09-25T00:00:00Z" }), "INVALID_REMINDER_STATE");
  });
  it("supports timezone/type changes and exhausted reschedule, but no resurrection", async () => {
    const f = await reminderFixture({ starts_at: "2026-09-24T00:00:00Z" });
    await patchReminder(f.db, f.userId, f.reminder.id, { timezone: "America/New_York", rrule: "FREQ=DAILY" });
    expect((await getReminder(f.db, f.userId, f.reminder.id)).scheduleVersion).toBe(2);
    await patchReminder(f.db, f.userId, f.reminder.id, { starts_at: "2026-09-20T00:00:00Z", rrule: null });
    expect((await getReminder(f.db, f.userId, f.reminder.id)).nextTriggerAt).toBe("2026-09-20T00:00:00.000Z");
    await patchReminder(f.db, f.userId, f.reminder.id, { rrule: "FREQ=DAILY;COUNT=2" });
    expect(await getReminder(f.db, f.userId, f.reminder.id)).toMatchObject({ status: "completed", nextTriggerAt: null });
    await code(patchReminder(f.db, f.userId, f.reminder.id, { starts_at: "2026-09-25T00:00:00Z" }), "INVALID_REMINDER_STATE");
  });
  it("cancel preserves triggered history, stays cancelled after historical handling, and is idempotent", async () => {
    const f = await reminderFixture({ rrule: "FREQ=DAILY" });
    await runReminderScheduler(f.db, await testAcceptance(), NOW);
    const cancelled = await cancelReminder(f.db, f.userId, f.reminder.id);
    expect(cancelled).toMatchObject({ status: "cancelled", cancelledAt: new Date(NOW).toISOString(), nextTriggerAt: null });
    expect(await cancelReminder(f.db, f.userId, f.reminder.id)).toEqual(cancelled);
    expect((await f.raw()).status).toBe("triggered");
    await code(handleOccurrence(f.db, f.userId, f.reminder.id, f.occurrence.id, "delay", "2026-09-25T00:00:00Z"), "INVALID_OCCURRENCE_STATE");
    await handleOccurrence(f.db, f.userId, f.reminder.id, f.occurrence.id, "skipped");
    expect((await getReminder(f.db, f.userId, f.reminder.id)).status).toBe("cancelled");
    await code(patchReminder(f.db, f.userId, f.reminder.id, { rrule: null }), "INVALID_REMINDER_STATE");
    const old = (await f.list()).find(o => o.status === "cancelled")!;
    await code(handleOccurrence(f.db, f.userId, f.reminder.id, old.id, "done"), "INVALID_OCCURRENCE_STATE");
  });
  it("enforces DB logical uniqueness, FK and counters", async () => {
    const f = await reminderFixture();
    const row = await f.raw();
    await expect(f.db.insert(reminderOccurrences).values({ ...row, id: crypto.randomUUID() })).rejects.toThrow();
    await expect(f.db.insert(reminderOccurrences).values({ ...row, id: crypto.randomUUID(), reminderId: "missing" })).rejects.toThrow();
    await expect(f.db.update(reminderOccurrences).set({ triggerVersion: 0 }).where(eq(reminderOccurrences.id, row.id))).rejects.toThrow();
  });
});
