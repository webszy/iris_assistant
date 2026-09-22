import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import { createMarkdown, readContent, updateContent } from "../controllers/resource-content";
import { errorResponseSchema } from "../lib/response";
import { resourceParamsSchema } from "../schemas/resource";
import { createMarkdownRequestSchema, createMarkdownResponseSchema, readContentResponseSchema, updateContentRequestSchema, updateContentResponseSchema } from "../schemas/resource-content";
import type { AppEnv } from "../types/env";

const errorContent = { "application/json": { schema: errorResponseSchema } };
const errors = {
  400: { content: errorContent, description: "BAD_REQUEST: missing/invalid fields or unknown properties." },
  401: { content: errorContent, description: "UNAUTHORIZED: missing or invalid Iris Bearer token." },
  404: { content: errorContent, description: "Project/Resource missing or inaccessible; CONTENT_NOT_FOUND for a broken content pointer." },
  413: { content: errorContent, description: "CONTENT_TOO_LARGE: Markdown exceeds 5 MiB UTF-8 bytes." },
  422: { content: errorContent, description: "RESOURCE_CONTENT_UNSUPPORTED: kind, repository, Markdown extension or Project path boundary is unsupported." },
  500: { content: errorContent, description: "INTERNAL_ERROR: server failure. Unknown write results require inspection before retrying." },
  502: { content: errorContent, description: "CONTENT_PROVIDER_ERROR: configuration, authentication, rate limit, network or malformed upstream response. A failed write response may have an unknown outcome; do not blindly retry." },
};

export const createMarkdownRoute = createRoute({
  method: "post", path: "/api/v1/projects/{projectId}/resources/markdown", tags: ["Resource"],
  summary: "Create a Markdown file and register its Resource",
  description: "Creates a new file under projects/<project.id>/<path>, then D1 metadata. Never overwrites or registers an existing file. kind/repository/user/project are server-controlled. milestone_id and task_id are mutually exclusive and must belong to this user and Project.",
  security: [{ bearerAuth: [] }],
  request: { params: resourceParamsSchema.pick({ projectId: true }), body: { required: true, content: { "application/json": { schema: createMarkdownRequestSchema } } } },
  responses: {
    201: { content: { "application/json": { schema: createMarkdownResponseSchema } }, description: "Resource and content metadata, including revision; no Markdown body." },
    ...errors,
    404: { content: errorContent, description: "Project/Milestone/Task does not exist or is outside the authenticated user and URL Project." },
    422: { content: errorContent, description: "INVALID_RESOURCE_SCOPE or INVALID_RESOURCE_LOCATION: invalid child scope or noncanonical/non-Markdown path." },
    500: { content: errorContent, description: "INTERNAL_ERROR: metadata insert failed. Compensation only follows confirmed absence; an unknown outcome or failed compensation requires operator inspection." },
    409: { content: errorContent, description: "CONTENT_ALREADY_EXISTS: physical path already exists. Use ordinary Resource POST to register an existing file." },
  },
});
export const readContentRoute = createRoute({
  method: "get", path: "/api/v1/projects/{projectId}/resources/{resourceId}/content", tags: ["Resource"],
  summary: "Read Markdown Resource content",
  description: "Requires kind=file, the configured logical repository, a canonical Markdown path within this Project ID directory and an existing file. Returns matching content/revision, up to 5 MiB.",
  security: [{ bearerAuth: [] }], request: { params: resourceParamsSchema },
  responses: { 200: { content: { "application/json": { schema: readContentResponseSchema } }, description: "Full content and its content revision." }, ...errors },
});
export const updateContentRoute = createRoute({
  method: "put", path: "/api/v1/projects/{projectId}/resources/{resourceId}/content", tags: ["Resource"],
  summary: "Replace Markdown content using optimistic concurrency",
  description: "GET before UPDATE. Replaces the full text only if expected_revision matches; never merges or retries with a newer revision. Does not update Resource metadata or updatedAt. Identical text may retain its revision; intermediate A→B→A changes are not detected.",
  security: [{ bearerAuth: [] }],
  request: { params: resourceParamsSchema, body: { required: true, content: { "application/json": { schema: updateContentRequestSchema } } } },
  responses: {
    200: { content: { "application/json": { schema: updateContentResponseSchema } }, description: "Content metadata including resulting revision; no Markdown body." },
    ...errors,
    409: { content: errorContent, description: "CONTENT_CONFLICT: re-read and resolve the intended edit against the latest content before retrying." },
  },
});

export function registerResourceContentRoutes(app: OpenAPIHono<AppEnv>): void {
  app.openapi(createMarkdownRoute, createMarkdown);
  app.openapi(readContentRoute, readContent);
  app.openapi(updateContentRoute, updateContent);
}
