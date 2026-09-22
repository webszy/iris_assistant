import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getReminder, patchReminder, handleOccurrence } from "../src/services/reminders";
import { runReminderScheduler } from "../src/services/reminder-scheduler";
import { reminderFixture, testAcceptance, resetReminders, NOW } from "./reminder-fixture";
beforeEach(async () => { await resetReminders(); vi.spyOn(Date, "now").mockReturnValue(NOW); });
afterEach(() => vi.restoreAllMocks());
describe("Reminder persistence integrity", () => {
  it("ships only the approved two tables with versioned uniqueness, indexes, UUIDs and integer times", async () => {
    const f = await reminderFixture();
    const columns = (await env.DB.prepare("PRAGMA table_info(reminder_occurrences)").all<{ name: string }>()).results.map(c => c.name);
    expect(columns).toEqual(["id", "user_id", "reminder_id", "schedule_version", "scheduled_for", "trigger_at", "trigger_version", "status", "trigger_count", "last_triggered_at", "handled_at", "created_at", "updated_at"]);
    expect(f.reminder.id).toMatch(/^[0-9a-f-]{14}4[0-9a-f-]{21}$/);
    expect(await env.DB.prepare("SELECT typeof(scheduled_for) t, scheduled_for FROM reminder_occurrences WHERE id=?").bind(f.occurrence.id).first()).toEqual({ t: "integer", scheduled_for: NOW });
    const indexes = (await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='reminder_occurrences'").all<{ name: string }>()).results.map(r => r.name);
    expect(indexes).toEqual(expect.arrayContaining(["reminder_occurrences_logical_unique", "reminder_occurrences_due_idx", "reminder_occurrences_user_status_trigger_idx", "reminder_occurrences_reminder_status_idx"]));
    expect((await env.DB.prepare("PRAGMA index_info(reminder_occurrences_logical_unique)").all<{ name: string }>()).results.map(c => c.name)).toEqual(["reminder_id", "schedule_version", "scheduled_for"]);
    expect(await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%notification%'").all()).toMatchObject({ results: expect.arrayContaining([{ name: "notifications" }, { name: "notification_deliveries" }, { name: "notification_settings" }, { name: "notification_channels" }]) });
  });
  it("concurrent repeated DONE/SKIP cannot duplicate advancement or handledAt", async () => {
    for (const action of ["done", "skipped"] as const) {
      const f = await reminderFixture({ rrule: "FREQ=DAILY" });
      const results = await Promise.all(Array.from({ length: 4 }, () => handleOccurrence(f.db, f.userId, f.reminder.id, f.occurrence.id, action)));
      expect(new Set(results.map(r => r.handledAt)).size).toBe(1);
      expect(await f.list()).toHaveLength(2);
    }
  });
  it("reschedule insertion failure rolls back definition, version and all pending cancellations", async () => {
    const f = await reminderFixture({ rrule: "FREQ=DAILY" });
    const before = await f.list();
    await env.DB.exec("CREATE TRIGGER fail_reschedule BEFORE INSERT ON reminder_occurrences BEGIN SELECT RAISE(ABORT,'test'); END;");
    try {
      await expect(patchReminder(f.db, f.userId, f.reminder.id, { starts_at: "2026-09-25T00:00:00Z" })).rejects.toThrow();
      expect(await f.list()).toEqual(before);
      expect(await getReminder(f.db, f.userId, f.reminder.id)).toEqual(f.reminder);
    } finally { await env.DB.exec("DROP TRIGGER fail_reschedule"); }
  });
  it("reschedule cancels every old pending including delayed and overdue, leaves history unchanged", async () => {
    const f = await reminderFixture({ rrule: "FREQ=DAILY" });
    await runReminderScheduler(f.db, await testAcceptance(), NOW);
    await handleOccurrence(f.db, f.userId, f.reminder.id, f.occurrence.id, "delay", "2026-09-30T00:00:00Z");
    vi.mocked(Date.now).mockReturnValue(NOW + 2 * 86400000);
    await patchReminder(f.db, f.userId, f.reminder.id, { starts_at: "2026-09-26T00:00:00Z" });
    const rows = await f.list();
    expect(rows.filter(o => o.scheduleVersion === 1).every(o => o.status === "cancelled")).toBe(true);
    expect(rows.filter(o => o.status === "pending")).toHaveLength(1);
    expect(rows.find(o => o.id === f.occurrence.id)).toMatchObject({ scheduledFor: f.occurrence.scheduledFor, triggerCount: 1, triggerVersion: 2, handledAt: null });
  });
  it("reschedule a past recurring rule chooses strictly future while preserving total COUNT", async () => {
    const f = await reminderFixture();
    const res = await patchReminder(f.db, f.userId, f.reminder.id, { starts_at: "2026-09-20T00:00:00Z", rrule: "FREQ=DAILY;COUNT=5" });
    expect(res.nextTriggerAt).toBe("2026-09-24T00:00:00.000Z");
    const last = (await f.list()).find(o => o.status === "pending")!;
    await handleOccurrence(f.db, f.userId, f.reminder.id, last.id, "done");
    expect((await getReminder(f.db, f.userId, f.reminder.id)).status).toBe("completed");
  });
});
