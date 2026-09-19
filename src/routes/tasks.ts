import { createRoute } from "@hono/zod-openapi";
import type { OpenAPIHono } from "@hono/zod-openapi";

import { errorResponseSchema } from "../lib/response";
import {
  createTaskRequestSchema,
  taskItemResponseSchema,
  taskListQuerySchema,
  taskListResponseSchema,
  taskParamsSchema,
  updateTaskRequestSchema,
} from "../schemas/task";
import { createTask, getTask, listTasks, updateTask } from "../controllers/tasks";
import type { AppEnv } from "../types/env";

const errorContent = { "application/json": { schema: errorResponseSchema } };

const RESPONSE_400 = { content: errorContent, description: "请求参数校验失败。" };
const RESPONSE_401 = { content: errorContent, description: "缺少或无效的访问令牌。" };
const RESPONSE_404 = {
  content: errorContent,
  description: "Project / Milestone / Task 不存在，或不属于当前用户与 URL Project。",
};

export const listTasksRoute = createRoute({
  method: "get",
  path: "/api/v1/projects/{projectId}/tasks",
  tags: ["Task"],
  summary: "列出 Project 下的 Tasks",
  description: "默认按 position 升序。支持 status 与 milestone_id 过滤；milestone_id 必须属于该 Project。",
  security: [{ bearerAuth: [] }],
  request: { params: taskParamsSchema.pick({ projectId: true }), query: taskListQuerySchema },
  responses: {
    200: { content: { "application/json": { schema: taskListResponseSchema } }, description: "查询成功" },
    400: RESPONSE_400,
    401: RESPONSE_401,
    404: RESPONSE_404,
  },
});

export const createTaskRoute = createRoute({
  method: "post",
  path: "/api/v1/projects/{projectId}/tasks",
  tags: ["Task"],
  summary: "创建 Task",
  description:
    "project_id 来自 URL；milestone_id 可空。创建时 status = completed 会同时写入 completed_at。",
  security: [{ bearerAuth: [] }],
  request: {
    params: taskParamsSchema.pick({ projectId: true }),
    body: { required: true, content: { "application/json": { schema: createTaskRequestSchema } } },
  },
  responses: {
    201: { content: { "application/json": { schema: taskItemResponseSchema } }, description: "创建成功" },
    400: RESPONSE_400,
    401: RESPONSE_401,
    404: RESPONSE_404,
  },
});

export const getTaskRoute = createRoute({
  method: "get",
  path: "/api/v1/projects/{projectId}/tasks/{taskId}",
  tags: ["Task"],
  summary: "读取单个 Task",
  security: [{ bearerAuth: [] }],
  request: { params: taskParamsSchema },
  responses: {
    200: { content: { "application/json": { schema: taskItemResponseSchema } }, description: "查询成功" },
    400: RESPONSE_400,
    401: RESPONSE_401,
    404: RESPONSE_404,
  },
});

export const updateTaskRoute = createRoute({
  method: "patch",
  path: "/api/v1/projects/{projectId}/tasks/{taskId}",
  tags: ["Task"],
  summary: "更新 Task",
  description:
    "非 completed → completed 写入 completed_at；completed → 非 completed 清空；completed → completed 保留原值。v0.1 不提供 Task 删除路由。",
  security: [{ bearerAuth: [] }],
  request: {
    params: taskParamsSchema,
    body: { required: true, content: { "application/json": { schema: updateTaskRequestSchema } } },
  },
  responses: {
    200: { content: { "application/json": { schema: taskItemResponseSchema } }, description: "更新成功" },
    400: RESPONSE_400,
    401: RESPONSE_401,
    404: RESPONSE_404,
  },
});

export function registerTaskRoutes(app: OpenAPIHono<AppEnv>): void {
  app.openapi(listTasksRoute, listTasks);
  app.openapi(createTaskRoute, createTask);
  app.openapi(getTaskRoute, getTask);
  app.openapi(updateTaskRoute, updateTask);
}
