import type { RouteHandler } from "@hono/zod-openapi";
import { createDb } from "../db";
import type { AppEnv } from "../types/env";
import type { listResourcesRoute, createResourceRoute, getResourceRoute, updateResourceRoute, deleteResourceRoute } from "../routes/resources";
import * as service from "../services/resources";

export const listResources: RouteHandler<typeof listResourcesRoute, AppEnv> = async (c) => {
  const { projectId } = c.req.valid("param");
  const data = await service.listResources(createDb(c.env.DB), c.get("user").id, projectId, c.req.valid("query"));
  return c.json({ success: true as const, data }, 200);
};

export const createResource: RouteHandler<typeof createResourceRoute, AppEnv> = async (c) => {
  const { projectId } = c.req.valid("param");
  const data = await service.createResource(createDb(c.env.DB), c.get("user").id, projectId, c.req.valid("json"));
  return c.json({ success: true as const, data }, 201);
};

export const getResource: RouteHandler<typeof getResourceRoute, AppEnv> = async (c) => {
  const { projectId, resourceId } = c.req.valid("param");
  const data = await service.getResource(createDb(c.env.DB), c.get("user").id, projectId, resourceId);
  return c.json({ success: true as const, data }, 200);
};

export const updateResource: RouteHandler<typeof updateResourceRoute, AppEnv> = async (c) => {
  const { projectId, resourceId } = c.req.valid("param");
  const data = await service.updateResource(createDb(c.env.DB), c.get("user").id, projectId, resourceId, c.req.valid("json"));
  return c.json({ success: true as const, data }, 200);
};

export const deleteResource: RouteHandler<typeof deleteResourceRoute, AppEnv> = async (c) => {
  const { projectId, resourceId } = c.req.valid("param");
  await service.deleteResource(createDb(c.env.DB), c.get("user").id, projectId, resourceId);
  return c.body(null, 204);
};
