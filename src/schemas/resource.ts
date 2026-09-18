import { z } from "@hono/zod-openapi";

export const RESOURCE_KINDS = ["repository", "directory", "file", "url"] as const;
export const RESOURCE_ROLES = ["context", "spec", "artifact", "reference"] as const;

export const resourceKindSchema = z.enum(RESOURCE_KINDS).openapi("ResourceKind");
export const resourceRoleSchema = z.enum(RESOURCE_ROLES).openapi("ResourceRole");

export type ResourceKind = (typeof RESOURCE_KINDS)[number];
export type ResourceRole = (typeof RESOURCE_ROLES)[number];

export const resourceResponseSchema = z
  .object({
    id: z.string(),
    projectId: z.string(),
    milestoneId: z.string().nullable(),
    taskId: z.string().nullable(),
    name: z.string(),
    kind: resourceKindSchema,
    role: resourceRoleSchema,
    repository: z.string().nullable(),
    path: z.string().nullable(),
    url: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("Resource");

export const resourceListResponseSchema = z
  .object({ success: z.literal(true), data: z.array(resourceResponseSchema) })
  .openapi("ResourceListResponse");

export const resourceItemResponseSchema = z
  .object({ success: z.literal(true), data: resourceResponseSchema })
  .openapi("ResourceItemResponse");

/**
 * 归属互斥：milestone_id 与 task_id 不能同时非空。
 * 具体业务约束（互斥、kind 与 location 匹配）在 handler 中按 422 返回，
 * 因为它们需要结合已有记录判断，不适合放在结构校验里。
 */
export const createResourceRequestSchema = z
  .object({
    name: z.string().min(1),
    kind: resourceKindSchema,
    role: resourceRoleSchema,
    milestone_id: z.string().min(1).nullable().optional(),
    task_id: z.string().min(1).nullable().optional(),
    repository: z.string().min(1).nullable().optional(),
    path: z.string().min(1).nullable().optional(),
    url: z.string().min(1).nullable().optional(),
  })
  .strict()
  .openapi("CreateResourceRequest");

export const updateResourceRequestSchema = z
  .object({
    name: z.string().min(1).optional(),
    kind: resourceKindSchema.optional(),
    role: resourceRoleSchema.optional(),
    milestone_id: z.string().min(1).nullable().optional(),
    task_id: z.string().min(1).nullable().optional(),
    repository: z.string().min(1).nullable().optional(),
    path: z.string().min(1).nullable().optional(),
    url: z.string().min(1).nullable().optional(),
  })
  .strict()
  .openapi("UpdateResourceRequest");

export const resourceParamsSchema = z
  .object({ projectId: z.string().min(1), resourceId: z.string().min(1) })
  .openapi("ResourceParams");

export const resourceListQuerySchema = z
  .object({
    kind: resourceKindSchema.optional(),
    role: resourceRoleSchema.optional(),
    milestone_id: z.string().min(1).optional(),
    task_id: z.string().min(1).optional(),
  })
  .openapi("ResourceListQuery");
