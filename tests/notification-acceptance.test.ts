import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { notificationFixture, resetNotifications, pauseNotificationBatch } from "./notification-fixture";
import { NOW } from "./reminder-fixture";
import { acceptReminderOccurrence, runReminderScheduler } from "../src/services/reminder-scheduler";
import { reminderNotificationAcceptance } from "../src/services/notification-acceptance";
import { cancelReminder, handleOccurrence, patchReminder } from "../src/services/reminders";
import { getNotification, patchNotificationChannel, putNotificationSettings } from "../src/services/notifications";

beforeEach(async () => { await resetNotifications(); vi.spyOn(Date, "now").mockReturnValue(NOW); vi.spyOn(console, "info").mockImplementation(() => {}); vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => vi.restoreAllMocks());
describe("Notification durable acceptance", () => {
  it("persists immutable source/content and initial delivery with trigger/progression exactly once", async () => {
    const f = await notificationFixture();
    const expected = await f.raw();
    expect(await f.accept()).toBe(true);
    expect(await acceptReminderOccurrence(f.db, expected, f.sink, NOW)).toBe(false);
    const [n] = await f.notifications();
    expect(n).toMatchObject({ sourceType: "reminder_occurrence", sourceId: f.occurrence.id, sourceVersion: 1,
      dedupeKey: `reminder-occurrence:${f.occurrence.id}:trigger:1`, title: "锻炼", body: "Original message" });
    expect(await f.deliveries()).toMatchObject([{ channel: "primary", status: "pending", attemptCount: 0, nextAttemptAt: NOW }]);
    expect(await f.raw()).toMatchObject({ status: "triggered", triggerCount: 1, lastTriggeredAt: NOW });
    expect(await f.list()).toHaveLength(2);
    await patchReminder(f.db, f.userId, f.reminder.id, { title: "New title", description: "New body" });
    expect(await getNotification(f.db, f.userId, n!.id)).toMatchObject({ title: "锻炼", body: "Original message",
      sourceContext: { reminderId: f.reminder.id }, deliveryState: "delivering" });
    await expect(env.DB.prepare("INSERT INTO notifications SELECT 'duplicate',user_id,source_type,source_id,source_version,dedupe_key,title,body,created_at FROM notifications WHERE id=?").bind(n!.id).run()).rejects.toThrow();
  });
  it.each(["notifications", "notification_deliveries", "progression"])("rolls back every write if %s insertion fails", async table => {
    const f = await notificationFixture();
    const name = table === "progression" ? "reminder_occurrences" : table;
    await env.DB.exec(`CREATE TRIGGER notification_test_fail BEFORE INSERT ON ${name} BEGIN SELECT RAISE(ABORT,'test'); END;`);
    try { await expect(f.accept()).rejects.toThrow(); }
    finally { await env.DB.exec("DROP TRIGGER notification_test_fail"); }
    expect(await f.notifications()).toHaveLength(0); expect(await f.deliveries()).toHaveLength(0);
    expect(await f.raw()).toMatchObject({ status: "pending", triggerCount: 0 }); expect(await f.list()).toHaveLength(1);
  });
  it.each(["missing_settings", "settings_disabled", "channels_disabled", "missing_adapter", "missing_runtime"])("%s leaves occurrence pending with no message", async mode => {
    const f = await notificationFixture(["primary"]);
    if (mode === "missing_settings") await env.DB.prepare("DELETE FROM notification_settings WHERE user_id=?").bind(f.userId).run();
    if (mode === "settings_disabled") await putNotificationSettings(f.db, f.userId, { enabled: false });
    if (mode === "channels_disabled") await patchNotificationChannel(f.db, f.userId, f.config[0]!.id, { enabled: false });
    if (mode === "missing_adapter") f.adapters.clear();
    if (mode === "missing_runtime") f.adapters.get("primary")!.usable = false;
    expect(await f.accept()).toBe(false);
    expect(await f.notifications()).toHaveLength(0); expect(await f.deliveries()).toHaveLength(0);
    expect(await f.raw()).toMatchObject({ status: "pending", triggerCount: 0 });
  });
  it.each(["disabled", "missing_adapter", "missing_config"])("skips %s primary and selects next usable channel", async mode => {
    const f = await notificationFixture();
    if (mode === "disabled") await patchNotificationChannel(f.db, f.userId, f.config[0]!.id, { enabled: false });
    if (mode === "missing_adapter") f.adapters.delete("primary");
    if (mode === "missing_config") f.adapters.get("primary")!.usable = false;
    await f.accept(); expect(await f.deliveries()).toMatchObject([{ channel: "backup" }]);
  });
  it("equal priorities use createdAt then id ordering", async () => {
    const f = await notificationFixture();
    for (const c of f.config) await patchNotificationChannel(f.db, f.userId, c.id, { priority: 5 });
    await f.accept();
    const expected = [...f.config].sort((a,b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))[0]!;
    expect(await f.deliveries()).toMatchObject([{ channel: expected.channel }]);
  });
  it("DELAY creates a new version and keeps the old immutable event", async () => {
    const f = await notificationFixture(); await f.accept();
    await handleOccurrence(f.db, f.userId, f.reminder.id, f.occurrence.id, "delay", new Date(NOW+60_000).toISOString());
    expect(await f.accept(NOW+60_000)).toBe(true);
    expect((await f.notifications()).map(n => n.sourceVersion).sort()).toEqual([1,2]);
    expect(await f.raw()).toMatchObject({ triggerCount: 2, triggerVersion: 2 });
  });
  it.each(["trigger_version", "trigger_at", "status"])("rejects stale %s", async mode => {
    const f = await notificationFixture(); const o = await f.raw();
    if (mode === "trigger_version") o.triggerVersion++;
    if (mode === "trigger_at") o.triggerAt--;
    if (mode === "status") await handleOccurrence(f.db, f.userId, f.reminder.id, o.id, "done");
    expect(await acceptReminderOccurrence(f.db, o, f.sink, NOW)).toBe(false);
    expect(await f.notifications()).toHaveLength(0);
  });
  it.each(["done", "skipped", "cancel", "reschedule", "delay"] as const)("%s commits first and invalidates stale acceptance", async action => {
    const f = await notificationFixture(); const paused = pauseNotificationBatch();
    const task = acceptReminderOccurrence(paused.db, await f.raw(), reminderNotificationAcceptance(paused.db, env, f.adapters), NOW);
    await Promise.race([paused.ready, task.then(() => { throw new Error("Missing batch"); })]);
    try {
      if (action === "cancel") await cancelReminder(f.db, f.userId, f.reminder.id);
      else if (action === "reschedule") await patchReminder(f.db, f.userId, f.reminder.id, { starts_at: new Date(NOW+86400000).toISOString() });
      else await handleOccurrence(f.db, f.userId, f.reminder.id, f.occurrence.id, action, new Date(NOW+60_000).toISOString());
    } finally { paused.release(); }
    expect(await task).toBe(false); expect(await f.notifications()).toHaveLength(0);
  });
  it("two concurrent acceptors create one Notification and one successor occurrence", async () => {
    const f = await notificationFixture(); const expected = await f.raw();
    const results = await Promise.all([acceptReminderOccurrence(f.db, expected, f.sink, NOW), acceptReminderOccurrence(f.db, expected, f.sink, NOW)]);
    expect(results.filter(Boolean)).toHaveLength(1); expect(await f.notifications()).toHaveLength(1); expect(await f.list()).toHaveLength(2);
  });
  it("settings disabling before acceptance commit rolls back the entire batch", async () => {
    const f = await notificationFixture(); const paused = pauseNotificationBatch();
    const task = acceptReminderOccurrence(paused.db, await f.raw(), reminderNotificationAcceptance(paused.db, env, f.adapters), NOW);
    const handled = task.catch(() => false);
    await Promise.race([paused.ready, handled.then(() => { throw new Error("Missing batch"); })]);
    try { await putNotificationSettings(f.db, f.userId, { enabled: false }); } finally { paused.release(); }
    expect(await handled).toBe(false); expect(await f.notifications()).toHaveLength(0); expect(await f.raw()).toMatchObject({ status: "pending" });
  });
  it("blocked backlog larger than scan budget cannot starve a usable user's reminder", async () => {
    const blocked = await notificationFixture(["primary"]);
    await putNotificationSettings(blocked.db, blocked.userId, { enabled: false });
    await env.DB.prepare(`WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<1100)
      INSERT INTO reminder_occurrences(id,user_id,reminder_id,schedule_version,scheduled_for,trigger_at,trigger_version,status,trigger_count,created_at,updated_at)
      SELECT 'blocked-'||x,?,?,1,?-x,?-x,1,'pending',0,?,? FROM n`).bind(blocked.userId,blocked.reminder.id,NOW,NOW,NOW,NOW).run();
    const f = await notificationFixture(["primary"]);
    expect(await runReminderScheduler(f.db, f.sink, NOW, 10)).toMatchObject({ accepted: 1 });
    expect(await f.raw()).toMatchObject({ status: "triggered" });
    expect(await blocked.raw()).toMatchObject({ status: "pending" });
  });
  it("keyset scan continues beyond blocked first page in the same run", async () => {
    const f = await notificationFixture(["primary"]);
    const blocked = await notificationFixture(["primary"]);
    await putNotificationSettings(blocked.db, blocked.userId, { enabled: false });
    await env.DB.prepare("UPDATE reminder_occurrences SET trigger_at=? WHERE user_id=?").bind(NOW-1,blocked.userId).run();
    const sink = { ...f.sink, eligibility: undefined };
    expect(await runReminderScheduler(f.db, sink, NOW, 1)).toMatchObject({ selected: 2, accepted: 1 });
  });
});
