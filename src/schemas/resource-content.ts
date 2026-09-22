import { z } from "@hono/zod-openapi";
import { resourceResponseSchema, resourceRoleSchema } from "./resource";

const commitMessageSchema = z.string().trim().min(1)
  .refine(value => Array.from(value).length <= 200, "commit_message must not exceed 200 Unicode characters.")
  .openapi({ description: "Trimmed; 1–200 Unicode code points. Defaults to Add/Update <resource name>, truncated to 200 code points." });
const markdownTextSchema = z.string().openapi({
  description: "Unmodified UTF-8 Markdown, including empty text. Maximum 5 MiB (5242880 bytes), otherwise 413 CONTENT_TOO_LARGE.",
});
const revisionSchema = z.string().min(1).openapi({ description: "Opaque content revision. Represents content, not every mutation event; identical content may have the same revision." });

export const createMarkdownRequestSchema = z.object({
  name: z.string().min(1),
  path: z.string().min(1).openapi({ description: "Canonical Project-relative POSIX path ending in .md or .markdown. No absolute paths, backslashes, null bytes, empty, dot or parent segments. Hidden directories are allowed.", example: "specs/v0.1-prd.md" }),
  role: resourceRoleSchema,
  content: markdownTextSchema,
  milestone_id: z.string().min(1).nullable().optional(),
  task_id: z.string().min(1).nullable().optional(),
  commit_message: commitMessageSchema.optional(),
}).strict().openapi("CreateMarkdownResourceRequest");

export const updateContentRequestSchema = z.object({
  content: markdownTextSchema,
  expected_revision: revisionSchema,
  commit_message: commitMessageSchema.optional(),
}).strict().openapi("UpdateResourceContentRequest");

const contentMetadataSchema = z.object({
  resourceId: z.string(),
  repository: z.string().openapi({ description: "Logical repository alias, not a physical repository URL." }),
  path: z.string().openapi({ description: "Physical path projects/<project.id>/<relative-path>." }),
  contentType: z.literal("text/markdown"),
  revision: revisionSchema,
  sizeBytes: z.number().int().min(0).max(5 * 1024 * 1024),
}).openapi("ResourceContentMetadata");

export const createMarkdownResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({ resource: resourceResponseSchema, content: contentMetadataSchema }),
}).openapi("CreateMarkdownResourceResponse");
export const readContentResponseSchema = z.object({
  success: z.literal(true),
  data: contentMetadataSchema.extend({ content: markdownTextSchema }),
}).openapi("ReadResourceContentResponse");
export const updateContentResponseSchema = z.object({
  success: z.literal(true), data: contentMetadataSchema,
}).openapi("UpdateResourceContentResponse");
