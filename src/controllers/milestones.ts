import type { RouteHandler } from "@hono/zod-openapi";
import { createDb } from "../db";
import type { AppEnv } from "../types/env";
import type { listMilestonesRoute, createMilestoneRoute, getMilestoneRoute, updateMilestoneRoute } from "../routes/milestones";
import * as service from "../services/milestones";

export const listMilestones: RouteHandler<typeof listMilestonesRoute, AppEnv> = async (c) => {
  const { projectId } = c.req.valid("param");
  const data = await service.listMilestones(createDb(c.env.DB), c.get("user").id, projectId, c.req.valid("query"));
  return c.json({ success: true as const, data }, 200);
};

export const createMilestone: RouteHandler<typeof createMilestoneRoute, AppEnv> = async (c) => {
  const { projectId } = c.req.valid("param");
  const data = await service.createMilestone(createDb(c.env.DB), c.get("user").id, projectId, c.req.valid("json"));
  return c.json({ success: true as const, data }, 201);
};

export const getMilestone: RouteHandler<typeof getMilestoneRoute, AppEnv> = async (c) => {
  const { projectId, milestoneId } = c.req.valid("param");
  const data = await service.getMilestone(createDb(c.env.DB), c.get("user").id, projectId, milestoneId);
  return c.json({ success: true as const, data }, 200);
};

export const updateMilestone: RouteHandler<typeof updateMilestoneRoute, AppEnv> = async (c) => {
  const { projectId, milestoneId } = c.req.valid("param");
  const data = await service.updateMilestone(createDb(c.env.DB), c.get("user").id, projectId, milestoneId, c.req.valid("json"));
  return c.json({ success: true as const, data }, 200);
};
