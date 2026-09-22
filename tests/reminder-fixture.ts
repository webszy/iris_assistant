import { env } from "cloudflare:test";
import { createDb } from "../src/db";
import { createReminder, listOccurrences, requireOccurrence } from "../src/services/reminders";
import type { ReminderNotificationAcceptance } from "../src/services/reminder-scheduler";
import type { CreateReminder } from "../src/schemas/reminder";
import { seedIdentity } from "./helpers";
export const NOW = Date.parse("2026-09-23T00:00:00Z");
export async function reminderFixture(body: Partial<CreateReminder> = {}) {
  const identity = await seedIdentity();
  const db = createDb(env.DB);
  const reminder = await createReminder(db, identity.userId, { title: "锻炼", starts_at: "2026-09-23T08:00:00+08:00", timezone: "Asia/Shanghai", ...body });
  const [occurrence] = await listOccurrences(db, identity.userId, reminder.id, {});
  if (!occurrence) throw new Error("Missing first occurrence");
  return { db, identity, userId: identity.userId, reminder, occurrence,
    raw: () => requireOccurrence(db, identity.userId, reminder.id, occurrence.id),
    list: () => listOccurrences(db, identity.userId, reminder.id, {}) };
}
/** Test-only durable acceptor: no Notification table is shipped in any migration. */
export async function testAcceptance(): Promise<ReminderNotificationAcceptance> {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS test_reminder_events (
    occurrence_id TEXT NOT NULL, trigger_version INTEGER NOT NULL, payload TEXT NOT NULL,
    PRIMARY KEY(occurrence_id, trigger_version))`).run();
  return { prepare: (db, input, guard) => db.prepare(`INSERT INTO test_reminder_events (occurrence_id,trigger_version,payload)
    SELECT ?,?,? WHERE ${guard.sql}`).bind(input.occurrenceId, input.triggerVersion, JSON.stringify(input), ...guard.bindings) };
}
export async function events() {
  return (await env.DB.prepare("SELECT occurrence_id, trigger_version, payload FROM test_reminder_events ORDER BY trigger_version").all<{ occurrence_id: string; trigger_version: number; payload: string }>()).results;
}

export async function resetReminders() {
  await env.DB.exec("DROP TABLE IF EXISTS test_reminder_events; DELETE FROM reminder_occurrences; DELETE FROM reminders;");
}
