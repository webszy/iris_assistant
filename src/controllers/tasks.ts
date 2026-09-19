import type { RouteHandler } from "@hono/zod-openapi";
import { createDb } from "../db";
import type { AppEnv } from "../types/env";
import type { listTasksRoute, createTaskRoute, getTaskRoute, updateTaskRoute } from "../routes/tasks";
import * as service from "../services/tasks";

export const listTasks: RouteHandler<typeof listTasksRoute, AppEnv> = async (c) => {
  const { projectId } = c.req.valid("param");
  const data = await service.listTasks(createDb(c.env.DB), c.get("user").id, projectId, c.req.valid("query"));
  return c.json({ success: true as const, data }, 200);
};

export const createTask: RouteHandler<typeof createTaskRoute, AppEnv> = async (c) => {
  const { projectId } = c.req.valid("param");
  const data = await service.createTask(createDb(c.env.DB), c.get("user").id, projectId, c.req.valid("json"));
  return c.json({ success: true as const, data }, 201);
};

export const getTask: RouteHandler<typeof getTaskRoute, AppEnv> = async (c) => {
  const { projectId, taskId } = c.req.valid("param");
  const data = await service.getTask(createDb(c.env.DB), c.get("user").id, projectId, taskId);
  return c.json({ success: true as const, data }, 200);
};

export const updateTask: RouteHandler<typeof updateTaskRoute, AppEnv> = async (c) => {
  const { projectId, taskId } = c.req.valid("param");
  const data = await service.updateTask(createDb(c.env.DB), c.get("user").id, projectId, taskId, c.req.valid("json"));
  return c.json({ success: true as const, data }, 200);
};
