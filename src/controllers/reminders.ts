import type { RouteHandler } from "@hono/zod-openapi";
import type { AppEnv } from "../types/env";
import type * as routes from "../routes/reminders";
import { createDb } from "../db";
import * as service from "../services/reminders";
export const listReminders: RouteHandler<typeof routes.listRemindersRoute, AppEnv> = async c => {
  const data = await service.listReminders(createDb(c.env.DB), c.get("user").id, c.req.valid("query"));
  return c.json({ success: true as const, data }, 200);
};
export const createReminder: RouteHandler<typeof routes.createReminderRoute, AppEnv> = async c => {
  const data = await service.createReminder(createDb(c.env.DB), c.get("user").id, c.req.valid("json"));
  return c.json({ success: true as const, data }, 201);
};
export const getReminder: RouteHandler<typeof routes.getReminderRoute, AppEnv> = async c => {
  const data = await service.getReminder(createDb(c.env.DB), c.get("user").id, c.req.valid("param").reminderId);
  return c.json({ success: true as const, data }, 200);
};
export const patchReminder: RouteHandler<typeof routes.patchReminderRoute, AppEnv> = async c => {
  const data = await service.patchReminder(createDb(c.env.DB), c.get("user").id, c.req.valid("param").reminderId, c.req.valid("json"));
  return c.json({ success: true as const, data }, 200);
};
export const cancelReminder: RouteHandler<typeof routes.cancelReminderRoute, AppEnv> = async c => {
  const data = await service.cancelReminder(createDb(c.env.DB), c.get("user").id, c.req.valid("param").reminderId);
  return c.json({ success: true as const, data }, 200);
};
export const listOccurrences: RouteHandler<typeof routes.listOccurrencesRoute, AppEnv> = async c => {
  const data = await service.listOccurrences(createDb(c.env.DB), c.get("user").id, c.req.valid("param").reminderId, c.req.valid("query"));
  return c.json({ success: true as const, data }, 200);
};
export const getOccurrence: RouteHandler<typeof routes.getOccurrenceRoute, AppEnv> = async c => {
  const data = await service.getOccurrence(createDb(c.env.DB), c.get("user").id, c.req.valid("param").reminderId, c.req.valid("param").occurrenceId);
  return c.json({ success: true as const, data }, 200);
};
export const doneOccurrence: RouteHandler<typeof routes.doneOccurrenceRoute, AppEnv> = async c => {
  const data = await service.handleOccurrence(createDb(c.env.DB), c.get("user").id, c.req.valid("param").reminderId, c.req.valid("param").occurrenceId, "done");
  return c.json({ success: true as const, data }, 200);
};
export const skipOccurrence: RouteHandler<typeof routes.skipOccurrenceRoute, AppEnv> = async c => {
  const data = await service.handleOccurrence(createDb(c.env.DB), c.get("user").id, c.req.valid("param").reminderId, c.req.valid("param").occurrenceId, "skipped");
  return c.json({ success: true as const, data }, 200);
};
export const delayOccurrence: RouteHandler<typeof routes.delayOccurrenceRoute, AppEnv> = async c => {
  const data = await service.handleOccurrence(createDb(c.env.DB), c.get("user").id, c.req.valid("param").reminderId, c.req.valid("param").occurrenceId, "delay", c.req.valid("json").until);
  return c.json({ success: true as const, data }, 200);
};
