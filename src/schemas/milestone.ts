import { z } from "@hono/zod-openapi";

export const MILESTONE_STATUSES = ["planned", "active", "completed", "cancelled"] as const;

export const milestoneStatusSchema = z.enum(MILESTONE_STATUSES).openapi("MilestoneStatus");

export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];

/** v0.1 不包含 deadline / due_at / target_at / completed_at。 */
export const milestoneResponseSchema = z
  .object({
    id: z.string(),
    projectId: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    status: milestoneStatusSchema,
    position: z.number().int(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("Milestone");

export const milestoneListResponseSchema = z
  .object({ success: z.literal(true), data: z.array(milestoneResponseSchema) })
  .openapi("MilestoneListResponse");

export const milestoneItemResponseSchema = z
  .object({ success: z.literal(true), data: milestoneResponseSchema })
  .openapi("MilestoneItemResponse");

export const createMilestoneRequestSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().nullable().optional(),
    status: milestoneStatusSchema.optional(),
    position: z.number().int().optional(),
  })
  .strict()
  .openapi("CreateMilestoneRequest");

export const updateMilestoneRequestSchema = z
  .object({
    name: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    status: milestoneStatusSchema.optional(),
    position: z.number().int().optional(),
  })
  .strict()
  .openapi("UpdateMilestoneRequest");

export const milestoneParamsSchema = z
  .object({ projectId: z.string().min(1), milestoneId: z.string().min(1) })
  .openapi("MilestoneParams");

export const milestoneListQuerySchema = z
  .object({ status: milestoneStatusSchema.optional() })
  .openapi("MilestoneListQuery");
