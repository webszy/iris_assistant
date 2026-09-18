import { z } from "@hono/zod-openapi";

/** v0.1 不加入 blocked / waiting / review。 */
export const TASK_STATUSES = ["todo", "doing", "completed", "cancelled"] as const;

export const taskStatusSchema = z.enum(TASK_STATUSES).openapi("TaskStatus");

export type TaskStatus = (typeof TASK_STATUSES)[number];

export const taskResponseSchema = z
  .object({
    id: z.string(),
    projectId: z.string(),
    milestoneId: z.string().nullable(),
    title: z.string(),
    description: z.string().nullable(),
    status: taskStatusSchema,
    position: z.number().int(),
    createdAt: z.string(),
    updatedAt: z.string(),
    completedAt: z.string().nullable(),
  })
  .openapi("Task");

export const taskListResponseSchema = z
  .object({ success: z.literal(true), data: z.array(taskResponseSchema) })
  .openapi("TaskListResponse");

export const taskItemResponseSchema = z
  .object({ success: z.literal(true), data: taskResponseSchema })
  .openapi("TaskItemResponse");

export const createTaskRequestSchema = z
  .object({
    milestone_id: z.string().min(1).nullable().optional(),
    title: z.string().min(1),
    description: z.string().nullable().optional(),
    status: taskStatusSchema.optional(),
    position: z.number().int().optional(),
  })
  .strict()
  .openapi("CreateTaskRequest");

export const updateTaskRequestSchema = z
  .object({
    /** 显式传 null 表示把 Task 从 Milestone 摘回 Project 级。 */
    milestone_id: z.string().min(1).nullable().optional(),
    title: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    status: taskStatusSchema.optional(),
    position: z.number().int().optional(),
  })
  .strict()
  .openapi("UpdateTaskRequest");

export const taskParamsSchema = z
  .object({ projectId: z.string().min(1), taskId: z.string().min(1) })
  .openapi("TaskParams");

export const taskListQuerySchema = z
  .object({
    status: taskStatusSchema.optional(),
    milestone_id: z.string().min(1).optional(),
  })
  .openapi("TaskListQuery");
