import { z } from "@hono/zod-openapi";
const datetime = z.iso.datetime({ offset: true });
export const notificationParams = z.object({ notificationId: z.string().min(1) });
export const notificationChannelParams = z.object({ channelId: z.string().min(1) });
export const notificationListQuery = z.object({ source_type: z.enum(["reminder_occurrence"]).optional(),
  from: datetime.optional(), to: datetime.optional() }).strict()
  .refine(q => !q.from || !q.to || Date.parse(q.from) <= Date.parse(q.to), { message: "from must not be after to" });
export const putNotificationSettingsSchema = z.object({ enabled: z.boolean() }).strict().openapi("PutNotificationSettings");
const channelFields = { enabled: z.boolean(), priority: z.number().int().min(0).max(2147483647) };
export const createNotificationChannelSchema = z.object({
  channel: z.string().trim().toLowerCase().min(1).max(64).regex(/^[a-z][a-z0-9_]*$/)
    .openapi({ description: "Server-registered adapter identifier; normalized to lowercase. No production adapter is registered yet." }),
  ...channelFields,
}).strict().openapi("CreateNotificationChannel");
export const patchNotificationChannelSchema = z.object(channelFields).partial().strict()
  .refine(v => Object.keys(v).length > 0, { message: "At least one field required" }).openapi("PatchNotificationChannel");
const notification = z.object({ id: z.string(), sourceType: z.literal("reminder_occurrence"), sourceId: z.string(),
  sourceVersion: z.number().int().positive(), sourceContext: z.object({ reminderId: z.string() }).nullable(),
  title: z.string(), body: z.string().nullable(), deliveryState: z.enum(["delivered", "delivering", "failed"]), createdAt: datetime,
}).openapi("Notification");
const delivery = z.object({ id: z.string(), notificationId: z.string(), channel: z.string(), status: z.enum(["pending", "sent", "failed"]),
  attemptCount: z.number().int().nonnegative(), nextAttemptAt: datetime.nullable(), lastAttemptAt: datetime.nullable(), sentAt: datetime.nullable(),
  providerMessageId: z.string().nullable(), lastErrorCode: z.string().nullable(), createdAt: datetime, updatedAt: datetime,
}).openapi("NotificationDelivery");
const settings = z.object({ enabled: z.boolean(), createdAt: datetime, updatedAt: datetime }).openapi("NotificationSettings");
const channel = z.object({ id: z.string(), channel: z.string(), enabled: z.boolean(), priority: z.number().int(), createdAt: datetime, updatedAt: datetime }).openapi("NotificationChannel");
export const notificationItemResponse = z.object({ success: z.literal(true), data: notification });
export const notificationListResponse = z.object({ success: z.literal(true), data: z.array(notification) });
export const notificationDeliveryListResponse = z.object({ success: z.literal(true), data: z.array(delivery) });
export const notificationSettingsResponse = z.object({ success: z.literal(true), data: settings });
export const notificationChannelResponse = z.object({ success: z.literal(true), data: channel });
export const notificationChannelListResponse = z.object({ success: z.literal(true), data: z.array(channel) });
export type NotificationListQuery = z.infer<typeof notificationListQuery>;
export type CreateNotificationChannel = z.infer<typeof createNotificationChannelSchema>;
export type PatchNotificationChannel = z.infer<typeof patchNotificationChannelSchema>;
