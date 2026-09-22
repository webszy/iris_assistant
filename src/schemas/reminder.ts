import { z } from "@hono/zod-openapi";

export const reminderStatus = z.enum(["active", "completed", "cancelled"]);
export const occurrenceStatus = z.enum(["pending", "triggered", "done", "skipped", "cancelled"]);
const datetime = z.iso.datetime({ offset: true });
const definition = {
  title: z.string().trim().min(1).max(500),
  description: z.string().max(10000).nullable().optional(),
  project_id: z.string().min(1).nullable().optional(),
  starts_at: datetime,
  timezone: z.string().min(1).max(100).openapi({ description: "IANA zone. Recurrence follows local wall time; nonexistent times are skipped, repeated times use the first instant.", example: "Asia/Shanghai" }),
  rrule: z.string().min(1).max(1000).nullable().optional().openapi({ description: "RRULE only: FREQ=DAILY/WEEKLY/MONTHLY/YEARLY, INTERVAL, BYDAY, BYMONTHDAY, BYMONTH, COUNT or UTC UNTIL (YYYYMMDDTHHmmssZ). DTSTART/TZID and other keys are rejected. starts_at must match; missed valid periods consume COUNT, DST gaps do not.", example: "FREQ=DAILY" }),
};
export const createReminderSchema = z.object(definition).strict().openapi("CreateReminderRequest");
export const patchReminderSchema = z.object(definition).partial().strict().openapi("PatchReminderRequest");
export const delayOccurrenceSchema = z.object({ until: datetime }).strict().openapi("DelayOccurrenceRequest");
export const emptyReminderActionSchema = z.object({}).strict().openapi("ReminderEmptyAction");
export const reminderParams = z.object({ reminderId: z.string().min(1) });
export const occurrenceParams = reminderParams.extend({ occurrenceId: z.string().min(1) });
export const reminderListQuery = z.object({ status: reminderStatus.optional(), project_id: z.string().min(1).optional() }).strict();
export const occurrenceListQuery = z.object({
  status: occurrenceStatus.optional(), from: datetime.optional(), to: datetime.optional(),
}).strict().refine(q => !q.from || !q.to || Date.parse(q.from) <= Date.parse(q.to), { message: "from must not be after to" });
export const reminderResponseSchema = z.object({
  id: z.string(), projectId: z.string().nullable(), title: z.string(), description: z.string().nullable(),
  status: reminderStatus, startsAt: datetime, timezone: z.string(), rrule: z.string().nullable(),
  scheduleVersion: z.number().int().positive(), nextTriggerAt: datetime.nullable(),
  createdAt: datetime, updatedAt: datetime, completedAt: datetime.nullable(), cancelledAt: datetime.nullable(),
}).openapi("Reminder");
export const occurrenceResponseSchema = z.object({
  id: z.string(), reminderId: z.string(), scheduleVersion: z.number().int().positive(),
  scheduledFor: datetime, triggerAt: datetime, triggerVersion: z.number().int().positive(), status: occurrenceStatus,
  triggerCount: z.number().int().nonnegative(), lastTriggeredAt: datetime.nullable(), handledAt: datetime.nullable(),
  createdAt: datetime, updatedAt: datetime,
}).openapi("ReminderOccurrence");
export const reminderItemResponse = z.object({ success: z.literal(true), data: reminderResponseSchema });
export const reminderListResponse = z.object({ success: z.literal(true), data: z.array(reminderResponseSchema) });
export const occurrenceItemResponse = z.object({ success: z.literal(true), data: occurrenceResponseSchema });
export const occurrenceListResponse = z.object({ success: z.literal(true), data: z.array(occurrenceResponseSchema) });
export type CreateReminder = z.infer<typeof createReminderSchema>;
export type PatchReminder = z.infer<typeof patchReminderSchema>;
export type ReminderListQuery = z.infer<typeof reminderListQuery>;
export type OccurrenceListQuery = z.infer<typeof occurrenceListQuery>;
