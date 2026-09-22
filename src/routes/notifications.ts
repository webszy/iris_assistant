import { createRoute, type OpenAPIHono, type z } from "@hono/zod-openapi";
import { errorResponseSchema } from "../lib/response";
import * as s from "../schemas/notification";
import * as controller from "../controllers/notifications";
import type { AppEnv } from "../types/env";
import { productionNotificationAdapters, type NotificationAdapters } from "../providers/notification-channel";
const content = { "application/json": { schema: errorResponseSchema } };
const errors = {
  400: { content, description: "BAD_REQUEST: strict request validation" },
  401: { content, description: "UNAUTHORIZED" },
  404: { content, description: "NOTIFICATION_NOT_FOUND / NOTIFICATION_CHANNEL_NOT_FOUND，包括跨用户资源" },
  409: { content, description: "NOTIFICATION_CHANNEL_ALREADY_EXISTS" },
  422: { content, description: "NOTIFICATION_SETTINGS_NOT_FOUND / INVALID_NOTIFICATION_CHANNEL" },
};
const body = <T extends z.ZodType>(schema: T) => ({ required: true, content: { "application/json": { schema } } });
export const listNotificationsRoute = createRoute({
  method: "get", path: "/api/v1/notifications", tags: ["Notification"], summary: "listNotifications",
  description: "列出通知；from/to 基于 createdAt，包含两端。", security: [{ bearerAuth: [] }],
  request: { query: s.notificationListQuery }, responses: { 200: { content: { "application/json": { schema: s.notificationListResponse } }, description: "成功" }, ...errors },
});
export const getNotificationSettingsRoute = createRoute({
  method: "get", path: "/api/v1/notifications/settings", tags: ["Notification"], summary: "getNotificationSettings",
  description: "设置缺失返回 422；不会自动启用。", security: [{ bearerAuth: [] }],
  request: {  }, responses: { 200: { content: { "application/json": { schema: s.notificationSettingsResponse } }, description: "成功" }, ...errors },
});
export const putNotificationSettingsRoute = createRoute({
  method: "put", path: "/api/v1/notifications/settings", tags: ["Notification"], summary: "putNotificationSettings",
  description: "总开关仅影响新 Delivery 选择；已有投递继续。", security: [{ bearerAuth: [] }],
  request: { body: body(s.putNotificationSettingsSchema) }, responses: { 200: { content: { "application/json": { schema: s.notificationSettingsResponse } }, description: "成功" }, ...errors },
});
export const listNotificationChannelsRoute = createRoute({
  method: "get", path: "/api/v1/notifications/channels", tags: ["Notification"], summary: "listNotificationChannels",
  description: "按 priority、createdAt、id 稳定排序。", security: [{ bearerAuth: [] }],
  request: {  }, responses: { 200: { content: { "application/json": { schema: s.notificationChannelListResponse } }, description: "成功" }, ...errors },
});
export const createNotificationChannelRoute = createRoute({
  method: "post", path: "/api/v1/notifications/channels", tags: ["Notification"], summary: "createNotificationChannel",
  description: "仅允许已注册 Adapter；重复渠道返回 409。", security: [{ bearerAuth: [] }],
  request: { body: body(s.createNotificationChannelSchema) }, responses: { 201: { content: { "application/json": { schema: s.notificationChannelResponse } }, description: "成功" }, ...errors },
});
export const patchNotificationChannelRoute = createRoute({
  method: "patch", path: "/api/v1/notifications/channels/{channelId}", tags: ["Notification"], summary: "patchNotificationChannel",
  description: "仅更新 enabled/priority，channel 不可变。", security: [{ bearerAuth: [] }],
  request: { params: s.notificationChannelParams, body: body(s.patchNotificationChannelSchema) }, responses: { 200: { content: { "application/json": { schema: s.notificationChannelResponse } }, description: "成功" }, ...errors },
});
export const getNotificationRoute = createRoute({
  method: "get", path: "/api/v1/notifications/{notificationId}", tags: ["Notification"], summary: "getNotification",
  description: "不可变消息；deliveryState 只由已持久化 Delivery 推导，sourceContext 按用户归属解析。", security: [{ bearerAuth: [] }],
  request: { params: s.notificationParams }, responses: { 200: { content: { "application/json": { schema: s.notificationItemResponse } }, description: "成功" }, ...errors },
});
export const listNotificationDeliveriesRoute = createRoute({
  method: "get", path: "/api/v1/notifications/{notificationId}/deliveries", tags: ["Notification"], summary: "listNotificationDeliveries",
  description: "投递历史；不返回租约或敏感错误。每分钟调度，nextAttemptAt 是最早重试时间。", security: [{ bearerAuth: [] }],
  request: { params: s.notificationParams }, responses: { 200: { content: { "application/json": { schema: s.notificationDeliveryListResponse } }, description: "成功" }, ...errors },
});
export function registerNotificationRoutes(app: OpenAPIHono<AppEnv>, adapters: NotificationAdapters = productionNotificationAdapters()) {
  app.openapi(listNotificationsRoute, controller.listNotifications);
  app.openapi(getNotificationSettingsRoute, controller.getNotificationSettings);
  app.openapi(putNotificationSettingsRoute, controller.putNotificationSettings);
  app.openapi(listNotificationChannelsRoute, controller.listNotificationChannels);
  app.openapi(createNotificationChannelRoute, controller.createNotificationChannel(adapters));
  app.openapi(patchNotificationChannelRoute, controller.patchNotificationChannel);
  app.openapi(getNotificationRoute, controller.getNotification);
  app.openapi(listNotificationDeliveriesRoute, controller.listNotificationDeliveries);
}
