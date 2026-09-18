import { z } from "@hono/zod-openapi";

/** v0.1 固定的 Project 枚举。kind 只是描述属性，不派生不同业务流程。 */
export const PROJECT_KINDS = [
  "product",
  "operation",
  "automation",
  "personal",
  "content",
  "other",
] as const;

export const PROJECT_STATUSES = ["planned", "active", "paused", "completed"] as const;

export const projectKindSchema = z.enum(PROJECT_KINDS).openapi("ProjectKind");
export const projectStatusSchema = z.enum(PROJECT_STATUSES).openapi("ProjectStatus");

export type ProjectKind = (typeof PROJECT_KINDS)[number];
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/** slug 只接受 lowercase [a-z0-9-]；合法提交不会被自动改写。 */
export const projectSlugSchema = z
  .string()
  .regex(/^[a-z0-9-]+$/, "slug 只能包含小写字母、数字和连字符。")
  .openapi("ProjectSlug", { example: "iris" });

export const projectResponseSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    description: z.string().nullable(),
    kind: projectKindSchema,
    status: projectStatusSchema,
    createdAt: z.string(),
    updatedAt: z.string(),
    archivedAt: z.string().nullable(),
  })
  .openapi("Project");

export const projectListResponseSchema = z
  .object({ success: z.literal(true), data: z.array(projectResponseSchema) })
  .openapi("ProjectListResponse");

export const projectItemResponseSchema = z
  .object({ success: z.literal(true), data: projectResponseSchema })
  .openapi("ProjectItemResponse");

export const createProjectRequestSchema = z
  .object({
    name: z.string().min(1),
    slug: projectSlugSchema,
    description: z.string().nullable().optional(),
    kind: projectKindSchema.optional(),
    status: projectStatusSchema.optional(),
  })
  .strict()
  .openapi("CreateProjectRequest");

export const updateProjectRequestSchema = z
  .object({
    name: z.string().min(1).optional(),
    slug: projectSlugSchema.optional(),
    description: z.string().nullable().optional(),
    kind: projectKindSchema.optional(),
    status: projectStatusSchema.optional(),
  })
  .strict()
  .openapi("UpdateProjectRequest");

export const projectParamsSchema = z
  .object({ projectId: z.string().min(1) })
  .openapi("ProjectParams");

/**
 * include_archived 使用字符串枚举而不是 z.coerce.boolean()：
 * 后者会把 "false" 按 JS truthy 解析成 true。
 */
export const projectListQuerySchema = z
  .object({
    status: projectStatusSchema.optional(),
    kind: projectKindSchema.optional(),
    include_archived: z.enum(["true", "false"]).optional(),
  })
  .openapi("ProjectListQuery");
