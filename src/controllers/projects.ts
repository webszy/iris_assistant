import type { RouteHandler } from "@hono/zod-openapi";
import { createDb } from "../db";
import type { AppEnv } from "../types/env";
import type { listProjectsRoute, createProjectRoute, getProjectRoute, updateProjectRoute, archiveProjectRoute, unarchiveProjectRoute } from "../routes/projects";
import * as service from "../services/projects";

export const listProjects: RouteHandler<typeof listProjectsRoute, AppEnv> = async (c) => {
  const data = await service.listProjects(createDb(c.env.DB), c.get("user").id, c.req.valid("query"));
  return c.json({ success: true as const, data }, 200);
};

export const createProject: RouteHandler<typeof createProjectRoute, AppEnv> = async (c) => {
  const data = await service.createProject(createDb(c.env.DB), c.get("user").id, c.req.valid("json"));
  return c.json({ success: true as const, data }, 201);
};

export const getProject: RouteHandler<typeof getProjectRoute, AppEnv> = async (c) => {
  const { projectId } = c.req.valid("param");
  const data = await service.getProject(createDb(c.env.DB), c.get("user").id, projectId);
  return c.json({ success: true as const, data }, 200);
};

export const updateProject: RouteHandler<typeof updateProjectRoute, AppEnv> = async (c) => {
  const { projectId } = c.req.valid("param");
  const data = await service.updateProject(createDb(c.env.DB), c.get("user").id, projectId, c.req.valid("json"));
  return c.json({ success: true as const, data }, 200);
};

export const archiveProject: RouteHandler<typeof archiveProjectRoute, AppEnv> = async (c) => {
  const { projectId } = c.req.valid("param");
  const data = await service.archiveProject(createDb(c.env.DB), c.get("user").id, projectId);
  return c.json({ success: true as const, data }, 200);
};

export const unarchiveProject: RouteHandler<typeof unarchiveProjectRoute, AppEnv> = async (c) => {
  const { projectId } = c.req.valid("param");
  const data = await service.unarchiveProject(createDb(c.env.DB), c.get("user").id, projectId);
  return c.json({ success: true as const, data }, 200);
};
