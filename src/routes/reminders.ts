import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import { errorResponseSchema } from "../lib/response";
import * as s from "../schemas/reminder";
import * as controller from "../controllers/reminders";
import type { AppEnv } from "../types/env";
const content = { "application/json": { schema: errorResponseSchema } };
const errors = {
  400: { content, description: "BAD_REQUEST: 请求字段、日期格式或过滤范围无效。" },
  401: { content, description: "UNAUTHORIZED" },
  404: { content, description: "REMINDER_NOT_FOUND / REMINDER_OCCURRENCE_NOT_FOUND / PROJECT_NOT_FOUND，含跨用户与错误父子关系。" },
  409: { content, description: "INVALID_REMINDER_STATE / INVALID_OCCURRENCE_STATE" },
  422: { content, description: "INVALID_TIMEZONE / INVALID_RRULE / INVALID_DELAY_TIME" },
};
const emptyActionBody = { required: false, content: { "application/json": { schema: s.emptyReminderActionSchema.optional() } } };
export const listRemindersRoute = createRoute({
  method: "get", path: "/api/v1/reminders", tags: ["Reminder"], summary: "列出 Reminders",
  description: "默认按创建时间降序；project_id 必须属于当前用户。", security: [{ bearerAuth: [] }], request: { query: s.reminderListQuery },
  responses: { 200: { content: { "application/json": { schema: s.reminderListResponse } }, description: "成功" }, ...errors },
});
export const createReminderRoute = createRoute({
  method: "post", path: "/api/v1/reminders", tags: ["Reminder"], summary: "创建 Reminder",
  description: "允许过去时间；创建定义与第一次 occurrence 原子提交。", security: [{ bearerAuth: [] }], request: { body: { required: true, content: { "application/json": { schema: s.createReminderSchema } } } },
  responses: { 201: { content: { "application/json": { schema: s.reminderItemResponse } }, description: "成功" }, ...errors },
});
export const getReminderRoute = createRoute({
  method: "get", path: "/api/v1/reminders/{reminderId}", tags: ["Reminder"], summary: "读取 Reminder",
  description: "nextTriggerAt 是所有 pending triggerAt 的最小值；active 时可以为 null。", security: [{ bearerAuth: [] }], request: { params: s.reminderParams },
  responses: { 200: { content: { "application/json": { schema: s.reminderItemResponse } }, description: "成功" }, ...errors },
});
export const patchReminderRoute = createRoute({
  method: "patch", path: "/api/v1/reminders/{reminderId}", tags: ["Reminder"], summary: "修改 Reminder",
  description: "实质调度修改增加 scheduleVersion，并取消旧版本全部 pending；已完成或取消的 Reminder 禁止重排。", security: [{ bearerAuth: [] }], request: { params: s.reminderParams, body: { required: true, content: { "application/json": { schema: s.patchReminderSchema } } } },
  responses: { 200: { content: { "application/json": { schema: s.reminderItemResponse } }, description: "成功" }, ...errors },
});
export const cancelReminderRoute = createRoute({
  method: "post", path: "/api/v1/reminders/{reminderId}/cancel", tags: ["Reminder"], summary: "永久取消 Reminder",
  description: "取消全部 pending，保留历史 triggered；重复调用幂等。", security: [{ bearerAuth: [] }], request: { params: s.reminderParams, body: emptyActionBody },
  responses: { 200: { content: { "application/json": { schema: s.reminderItemResponse } }, description: "成功" }, ...errors },
});
export const listOccurrencesRoute = createRoute({
  method: "get", path: "/api/v1/reminders/{reminderId}/occurrences", tags: ["Reminder"], summary: "列出 Occurrences",
  description: "from/to 基于 scheduledFor，包含两端；按 scheduledFor、scheduleVersion 升序。", security: [{ bearerAuth: [] }], request: { params: s.reminderParams, query: s.occurrenceListQuery },
  responses: { 200: { content: { "application/json": { schema: s.occurrenceListResponse } }, description: "成功" }, ...errors },
});
export const getOccurrenceRoute = createRoute({
  method: "get", path: "/api/v1/reminders/{reminderId}/occurrences/{occurrenceId}", tags: ["Reminder"], summary: "读取 Occurrence",
  description: "Reminder 与 occurrence 必须同属当前用户，且父子关系匹配。", security: [{ bearerAuth: [] }], request: { params: s.occurrenceParams },
  responses: { 200: { content: { "application/json": { schema: s.occurrenceItemResponse } }, description: "成功" }, ...errors },
});
export const doneOccurrenceRoute = createRoute({
  method: "post", path: "/api/v1/reminders/{reminderId}/occurrences/{occurrenceId}/done", tags: ["Reminder"], summary: "完成本次提醒",
  description: "允许 pending/triggered；重复 DONE 幂等；旧版本只收尾不推进。", security: [{ bearerAuth: [] }], request: { params: s.occurrenceParams, body: emptyActionBody },
  responses: { 200: { content: { "application/json": { schema: s.occurrenceItemResponse } }, description: "成功" }, ...errors },
});
export const skipOccurrenceRoute = createRoute({
  method: "post", path: "/api/v1/reminders/{reminderId}/occurrences/{occurrenceId}/skip", tags: ["Reminder"], summary: "跳过本次提醒",
  description: "允许 pending/triggered；重复 SKIP 幂等；后续规则继续。", security: [{ bearerAuth: [] }], request: { params: s.occurrenceParams, body: emptyActionBody },
  responses: { 200: { content: { "application/json": { schema: s.occurrenceItemResponse } }, description: "成功" }, ...errors },
});
export const delayOccurrenceRoute = createRoute({
  method: "post", path: "/api/v1/reminders/{reminderId}/occurrences/{occurrenceId}/delay", tags: ["Reminder"], summary: "推迟本次提醒",
  description: "只修改当前版本的目标 occurrence；until 必须晚于现在，实质变化递增 triggerVersion，不影响其他 occurrence。", security: [{ bearerAuth: [] }], request: { params: s.occurrenceParams, body: { required: true, content: { "application/json": { schema: s.delayOccurrenceSchema } } } },
  responses: { 200: { content: { "application/json": { schema: s.occurrenceItemResponse } }, description: "成功" }, ...errors },
});
export function registerReminderRoutes(app: OpenAPIHono<AppEnv>): void {
  app.openapi(listRemindersRoute, controller.listReminders);
  app.openapi(createReminderRoute, controller.createReminder);
  app.openapi(getReminderRoute, controller.getReminder);
  app.openapi(patchReminderRoute, controller.patchReminder);
  app.openapi(cancelReminderRoute, controller.cancelReminder);
  app.openapi(listOccurrencesRoute, controller.listOccurrences);
  app.openapi(getOccurrenceRoute, controller.getOccurrence);
  app.openapi(doneOccurrenceRoute, controller.doneOccurrence);
  app.openapi(skipOccurrenceRoute, controller.skipOccurrence);
  app.openapi(delayOccurrenceRoute, controller.delayOccurrence);
}
