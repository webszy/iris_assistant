import type { RouteHandler } from "@hono/zod-openapi";
import { createDb } from "../db";
import type * as routes from "../routes/notifications";
import * as service from "../services/notifications";
import type { NotificationAdapters } from "../providers/notification-channel";
import type { AppEnv } from "../types/env";
export const listNotifications: RouteHandler<typeof routes.listNotificationsRoute, AppEnv> = async c => {
  const data = await service.listNotifications(createDb(c.env.DB), c.get("user").id, c.req.valid("query"));
  return c.json({ success: true as const, data }, 200);
};
export const getNotificationSettings: RouteHandler<typeof routes.getNotificationSettingsRoute, AppEnv> = async c => {
  const data = await service.getNotificationSettings(createDb(c.env.DB), c.get("user").id);
  return c.json({ success: true as const, data }, 200);
};
export const putNotificationSettings: RouteHandler<typeof routes.putNotificationSettingsRoute, AppEnv> = async c => {
  const data = await service.putNotificationSettings(createDb(c.env.DB), c.get("user").id, c.req.valid("json"));
  return c.json({ success: true as const, data }, 200);
};
export const listNotificationChannels: RouteHandler<typeof routes.listNotificationChannelsRoute, AppEnv> = async c => {
  const data = await service.listNotificationChannels(createDb(c.env.DB), c.get("user").id);
  return c.json({ success: true as const, data }, 200);
};
export const createNotificationChannel = (adapters: NotificationAdapters): RouteHandler<typeof routes.createNotificationChannelRoute, AppEnv> => async c => {
  const data = await service.createNotificationChannel(createDb(c.env.DB), c.get("user").id, c.req.valid("json"), adapters);
  return c.json({ success: true as const, data }, 201);
};
export const patchNotificationChannel: RouteHandler<typeof routes.patchNotificationChannelRoute, AppEnv> = async c => {
  const data = await service.patchNotificationChannel(createDb(c.env.DB), c.get("user").id, c.req.valid("param").channelId, c.req.valid("json"));
  return c.json({ success: true as const, data }, 200);
};
export const getNotification: RouteHandler<typeof routes.getNotificationRoute, AppEnv> = async c => {
  const data = await service.getNotification(createDb(c.env.DB), c.get("user").id, c.req.valid("param").notificationId);
  return c.json({ success: true as const, data }, 200);
};
export const listNotificationDeliveries: RouteHandler<typeof routes.listNotificationDeliveriesRoute, AppEnv> = async c => {
  const data = await service.listNotificationDeliveries(createDb(c.env.DB), c.get("user").id, c.req.valid("param").notificationId);
  return c.json({ success: true as const, data }, 200);
};
