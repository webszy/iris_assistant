import { z } from "@hono/zod-openapi";

/** v0.1 只允许 script / skill；不提前加入 http / workflow / tool。 */
export const CAPABILITY_TYPES = ["script", "skill"] as const;

export const capabilityTypeSchema = z.enum(CAPABILITY_TYPES).openapi("CapabilityType");

export type CapabilityType = (typeof CAPABILITY_TYPES)[number];

export const capabilityResponseSchema = z
  .object({
    id: z.string(),
    projectId: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    type: capabilityTypeSchema,
    resourceId: z.string(),
    enabled: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("Capability");

export const capabilityListResponseSchema = z
  .object({ success: z.literal(true), data: z.array(capabilityResponseSchema) })
  .openapi("CapabilityListResponse");

export const capabilityItemResponseSchema = z
  .object({ success: z.literal(true), data: capabilityResponseSchema })
  .openapi("CapabilityItemResponse");

/** resource_id 必填：Capability 不能脱离 Resource 独立存在。 */
export const createCapabilityRequestSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().nullable().optional(),
    type: capabilityTypeSchema,
    resource_id: z.string().min(1),
    enabled: z.boolean().optional(),
  })
  .strict()
  .openapi("CreateCapabilityRequest");

export const updateCapabilityRequestSchema = z
  .object({
    name: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    type: capabilityTypeSchema.optional(),
    resource_id: z.string().min(1).optional(),
    enabled: z.boolean().optional(),
  })
  .strict()
  .openapi("UpdateCapabilityRequest");

export const capabilityParamsSchema = z
  .object({ projectId: z.string().min(1), capabilityId: z.string().min(1) })
  .openapi("CapabilityParams");

/** enabled 使用字符串枚举，避免 "false" 被按 JS truthy 解析成 true。 */
export const capabilityListQuerySchema = z
  .object({
    type: capabilityTypeSchema.optional(),
    enabled: z.enum(["true", "false"]).optional(),
  })
  .openapi("CapabilityQuery");
