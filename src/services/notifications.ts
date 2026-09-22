import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import type { Database } from "../db";
import { notifications, notificationDeliveries, notificationSettings, notificationChannels } from "../db/schema";
import { ServiceError } from "../lib/service-error";
import { nowEpochMs, toIso8601Utc } from "../lib/time";
import type { NotificationAdapters } from "../providers/notification-channel";
import type { NotificationListQuery, CreateNotificationChannel, PatchNotificationChannel } from "../schemas/notification";

const iso = (value: number | null) => value === null ? null : toIso8601Utc(value);
const deliveryState = sql<"delivered" | "delivering" | "failed">`CASE
  WHEN EXISTS (SELECT 1 FROM notification_deliveries d WHERE d.notification_id=notifications.id AND d.user_id=notifications.user_id AND d.status='sent') THEN 'delivered'
  WHEN EXISTS (SELECT 1 FROM notification_deliveries d WHERE d.notification_id=notifications.id AND d.user_id=notifications.user_id AND d.status='pending') THEN 'delivering'
  ELSE 'failed' END`;
const reminderId = sql<string | null>`(SELECT r.id FROM reminder_occurrences o JOIN reminders r ON r.id=o.reminder_id AND r.user_id=o.user_id
  WHERE notifications.source_type='reminder_occurrence' AND o.id=notifications.source_id AND o.user_id=notifications.user_id)`;
const columns = { row: notifications, deliveryState, reminderId };
function toNotification(result: { row: typeof notifications.$inferSelect; deliveryState: "delivered" | "delivering" | "failed"; reminderId: string | null }) {
  const n = result.row;
  return { id: n.id, sourceType: n.sourceType, sourceId: n.sourceId, sourceVersion: n.sourceVersion,
    sourceContext: result.reminderId === null ? null : { reminderId: result.reminderId },
    title: n.title, body: n.body, deliveryState: result.deliveryState, createdAt: toIso8601Utc(n.createdAt) };
}
export async function getNotification(db: Database, userId: string, id: string) {
  const [result] = await db.select(columns).from(notifications).where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
  if (!result) throw new ServiceError("NOTIFICATION_NOT_FOUND", "Notification 不存在。");
  return toNotification(result);
}
export async function listNotifications(db: Database, userId: string, query: NotificationListQuery) {
  const filters = [eq(notifications.userId, userId)];
  if (query.source_type) filters.push(eq(notifications.sourceType, query.source_type));
  if (query.from) filters.push(gte(notifications.createdAt, Date.parse(query.from)));
  if (query.to) filters.push(lte(notifications.createdAt, Date.parse(query.to)));
  return (await db.select(columns).from(notifications).where(and(...filters))
    .orderBy(desc(notifications.createdAt), asc(notifications.id))).map(toNotification);
}
export async function listNotificationDeliveries(db: Database, userId: string, id: string) {
  await getNotification(db, userId, id);
  const rows = await db.select().from(notificationDeliveries).where(and(eq(notificationDeliveries.userId, userId), eq(notificationDeliveries.notificationId, id)))
    .orderBy(asc(notificationDeliveries.createdAt), asc(notificationDeliveries.id));
  return rows.map(d => ({ id: d.id, notificationId: d.notificationId, channel: d.channel, status: d.status,
    attemptCount: d.attemptCount, nextAttemptAt: iso(d.nextAttemptAt), lastAttemptAt: iso(d.lastAttemptAt),
    sentAt: iso(d.sentAt), providerMessageId: d.providerMessageId, lastErrorCode: d.lastErrorCode,
    createdAt: toIso8601Utc(d.createdAt), updatedAt: toIso8601Utc(d.updatedAt) }));
}
function toSettings(s: typeof notificationSettings.$inferSelect) {
  return { enabled: s.enabled, createdAt: toIso8601Utc(s.createdAt), updatedAt: toIso8601Utc(s.updatedAt) };
}
export async function getNotificationSettings(db: Database, userId: string) {
  const [row] = await db.select().from(notificationSettings).where(eq(notificationSettings.userId, userId));
  if (!row) throw new ServiceError("NOTIFICATION_SETTINGS_NOT_FOUND", "请先配置 Notification settings。");
  return toSettings(row);
}
export async function putNotificationSettings(db: Database, userId: string, body: { enabled: boolean }) {
  const now = nowEpochMs();
  const [row] = await db.insert(notificationSettings).values({ userId, enabled: body.enabled, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: notificationSettings.userId, set: { enabled: body.enabled, updatedAt: now } }).returning();
  if (!row) throw new Error("Notification settings missing after upsert");
  return toSettings(row);
}
function toChannel(c: typeof notificationChannels.$inferSelect) {
  return { id: c.id, channel: c.channel, enabled: c.enabled, priority: c.priority,
    createdAt: toIso8601Utc(c.createdAt), updatedAt: toIso8601Utc(c.updatedAt) };
}
export async function listNotificationChannels(db: Database, userId: string) {
  return (await db.select().from(notificationChannels).where(eq(notificationChannels.userId, userId))
    .orderBy(asc(notificationChannels.priority), asc(notificationChannels.createdAt), asc(notificationChannels.id))).map(toChannel);
}
export async function createNotificationChannel(db: Database, userId: string, body: CreateNotificationChannel, adapters: NotificationAdapters) {
  if (!adapters.has(body.channel)) throw new ServiceError("INVALID_NOTIFICATION_CHANNEL", "未注册的通知渠道。");
  const now = nowEpochMs();
  const [row] = await db.insert(notificationChannels).values({ id: crypto.randomUUID(), userId, ...body, createdAt: now, updatedAt: now })
    .onConflictDoNothing({ target: [notificationChannels.userId, notificationChannels.channel] }).returning();
  if (!row) throw new ServiceError("NOTIFICATION_CHANNEL_ALREADY_EXISTS", "此通知渠道已经存在。");
  return toChannel(row);
}
export async function patchNotificationChannel(db: Database, userId: string, id: string, body: PatchNotificationChannel) {
  const [row] = await db.update(notificationChannels).set({ ...body, updatedAt: nowEpochMs() })
    .where(and(eq(notificationChannels.userId, userId), eq(notificationChannels.id, id))).returning();
  if (!row) throw new ServiceError("NOTIFICATION_CHANNEL_NOT_FOUND", "Notification channel 不存在。");
  return toChannel(row);
}
