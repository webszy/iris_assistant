import type { RouteHandler } from "@hono/zod-openapi";
import { createDb } from "../db";
import type { createMarkdownRoute, readContentRoute, updateContentRoute } from "../routes/resource-content";
import * as service from "../services/resource-content";
import type { AppEnv } from "../types/env";

export const createMarkdown: RouteHandler<typeof createMarkdownRoute, AppEnv> = async c => {
  const { projectId } = c.req.valid("param");
  const data = await service.createMarkdownResource(createDb(c.env.DB), c.env, c.get("user").id, projectId, c.req.valid("json"));
  return c.json({ success: true as const, data }, 201);
};
export const readContent: RouteHandler<typeof readContentRoute, AppEnv> = async c => {
  const { projectId, resourceId } = c.req.valid("param");
  const data = await service.readResourceContent(createDb(c.env.DB), c.env, c.get("user").id, projectId, resourceId);
  return c.json({ success: true as const, data }, 200);
};
export const updateContent: RouteHandler<typeof updateContentRoute, AppEnv> = async c => {
  const { projectId, resourceId } = c.req.valid("param");
  const data = await service.updateResourceContent(createDb(c.env.DB), c.env, c.get("user").id, projectId, resourceId, c.req.valid("json"));
  return c.json({ success: true as const, data }, 200);
};
