import type { Database } from "../db";
import type { Env } from "../types/env";
import { usableAdapterNames, type NotificationAdapters } from "../providers/notification-channel";
import type { ReminderNotificationAcceptance } from "./reminder-scheduler";
import { channelSelection, notificationLog } from "./notification-selection";

/** Source fencing, both inserts, and recurring progression share ReminderMutation's D1 batch. */
export function reminderNotificationAcceptance(db: Database, env: Env, adapters: NotificationAdapters): ReminderNotificationAcceptance {
  const usable = usableAdapterNames(adapters, env);
  return {
    // Eliminate persistently blocked users before the scheduler's bounded keyset scan.
    eligibility: { sql: `EXISTS (SELECT 1 FROM notification_settings s JOIN notification_channels c ON c.user_id=s.user_id
      WHERE s.user_id=reminder_occurrences.user_id AND s.enabled=1 AND c.enabled=1
      AND c.channel IN (${usable.length ? usable.map(() => "?").join(",") : "NULL"}))`, bindings: usable },
    async prepare(client, input, guard) {
      const selection = channelSelection(input.userId, usable);
      const selected = await client.prepare(selection.sql).bind(...selection.bindings).first<{ channel: string }>();
      if (!selected) {
        notificationLog("acceptance_rejected", { sourceType: "reminder_occurrence", sourceId: input.occurrenceId,
          sourceVersion: input.triggerVersion, reason: "NO_USABLE_NOTIFICATION_CHANNEL" });
        return null;
      }
      const id = crypto.randomUUID();
      const deliveryId = crypto.randomUUID();
      return {
        statements: [
          client.prepare(`INSERT INTO notifications(id,user_id,source_type,source_id,source_version,dedupe_key,title,body,created_at)
            SELECT ?,?,'reminder_occurrence',?,?,?,?,?,? WHERE ${guard.sql} AND EXISTS (${selection.sql})`)
            .bind(id, input.userId, input.occurrenceId, input.triggerVersion, input.idempotencyKey, input.title,
              input.description, input.acceptedAt, ...guard.bindings, ...selection.bindings),
          client.prepare(`INSERT INTO notification_deliveries(id,user_id,notification_id,channel,status,attempt_count,next_attempt_at,created_at,updated_at)
            SELECT ?,?,?,(${selection.sql}),'pending',0,?,?,? WHERE ${guard.sql}
            AND EXISTS (SELECT 1 FROM notifications WHERE id=? AND user_id=?)`)
            .bind(deliveryId, input.userId, id, ...selection.bindings, input.acceptedAt, input.acceptedAt,
              input.acceptedAt, ...guard.bindings, id, input.userId),
        ],
        accepted: { sql: `EXISTS (SELECT 1 FROM notifications n JOIN notification_deliveries d ON d.notification_id=n.id AND d.user_id=n.user_id
          WHERE n.id=? AND n.user_id=? AND d.id=?)`, bindings: [id, input.userId, deliveryId] },
        async afterCommit() {
          const row = await db.$client.prepare("SELECT channel FROM notification_deliveries WHERE id=? AND user_id=?")
            .bind(deliveryId, input.userId).first<{ channel: string }>();
          notificationLog("acceptance_accepted", { sourceType: "reminder_occurrence", sourceId: input.occurrenceId,
            sourceVersion: input.triggerVersion, notificationId: id, selectedChannel: row?.channel ?? "unknown" });
        },
      };
    },
  };
}
