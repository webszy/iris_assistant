import type { RouteHandler } from "@hono/zod-openapi";
import { createDb } from "../db";
import type { AppEnv } from "../types/env";
import type { listCapabilitiesRoute, createCapabilityRoute, getCapabilityRoute, updateCapabilityRoute, enableCapabilityRoute, disableCapabilityRoute } from "../routes/capabilities";
import * as service from "../services/capabilities";

export const listCapabilities: RouteHandler<typeof listCapabilitiesRoute, AppEnv> = async (c) => {
  const { projectId } = c.req.valid("param");
  const data = await service.listCapabilities(createDb(c.env.DB), c.get("user").id, projectId, c.req.valid("query"));
  return c.json({ success: true as const, data }, 200);
};

export const createCapability: RouteHandler<typeof createCapabilityRoute, AppEnv> = async (c) => {
  const { projectId } = c.req.valid("param");
  const data = await service.createCapability(createDb(c.env.DB), c.get("user").id, projectId, c.req.valid("json"));
  return c.json({ success: true as const, data }, 201);
};

export const getCapability: RouteHandler<typeof getCapabilityRoute, AppEnv> = async (c) => {
  const { projectId, capabilityId } = c.req.valid("param");
  const data = await service.getCapability(createDb(c.env.DB), c.get("user").id, projectId, capabilityId);
  return c.json({ success: true as const, data }, 200);
};

export const updateCapability: RouteHandler<typeof updateCapabilityRoute, AppEnv> = async (c) => {
  const { projectId, capabilityId } = c.req.valid("param");
  const data = await service.updateCapability(createDb(c.env.DB), c.get("user").id, projectId, capabilityId, c.req.valid("json"));
  return c.json({ success: true as const, data }, 200);
};

export const enableCapability: RouteHandler<typeof enableCapabilityRoute, AppEnv> = async (c) => {
  const { projectId, capabilityId } = c.req.valid("param");
  const data = await service.enableCapability(createDb(c.env.DB), c.get("user").id, projectId, capabilityId);
  return c.json({ success: true as const, data }, 200);
};

export const disableCapability: RouteHandler<typeof disableCapabilityRoute, AppEnv> = async (c) => {
  const { projectId, capabilityId } = c.req.valid("param");
  const data = await service.disableCapability(createDb(c.env.DB), c.get("user").id, projectId, capabilityId);
  return c.json({ success: true as const, data }, 200);
};
