import { createRoute } from "@hono/zod-openapi";
import type { OpenAPIHono } from "@hono/zod-openapi";

import { errorResponseSchema } from "../lib/response";
import {
  createProjectRequestSchema,
  projectItemResponseSchema,
  projectListQuerySchema,
  projectListResponseSchema,
  projectParamsSchema,
  updateProjectRequestSchema,
} from "../schemas/project";
import {
  archiveProject,
  createProject,
  getProject,
  listProjects,
  unarchiveProject,
  updateProject,
} from "../controllers/projects";
import type { AppEnv } from "../types/env";

const errorContent = { "application/json": { schema: errorResponseSchema } };

const RESPONSE_400 = { content: errorContent, description: "请求参数校验失败。" };
const RESPONSE_401 = { content: errorContent, description: "缺少或无效的访问令牌。" };
const RESPONSE_404 = { content: errorContent, description: "Project 不存在或不属于当前用户。" };

export const listProjectsRoute = createRoute({
  method: "get",
  path: "/api/v1/projects",
  tags: ["Project"],
  summary: "列出当前用户的 Projects",
  description: "默认不返回已归档 Project；include_archived=true 时包含已归档。按 created_at 倒序，不做分页。",
  security: [{ bearerAuth: [] }],
  request: { query: projectListQuerySchema },
  responses: {
    200: { content: { "application/json": { schema: projectListResponseSchema } }, description: "查询成功" },
    400: RESPONSE_400,
    401: RESPONSE_401,
  },
});

export const createProjectRoute = createRoute({
  method: "post",
  path: "/api/v1/projects",
  tags: ["Project"],
  summary: "创建 Project",
  description: "user_id 与全部时间字段由服务端赋值；body 中出现只读字段会被拒绝。",
  security: [{ bearerAuth: [] }],
  request: {
    body: { required: true, content: { "application/json": { schema: createProjectRequestSchema } } },
  },
  responses: {
    201: { content: { "application/json": { schema: projectItemResponseSchema } }, description: "创建成功" },
    400: RESPONSE_400,
    401: RESPONSE_401,
    409: { content: errorContent, description: "同一用户下 slug 已存在。" },
  },
});

export const getProjectRoute = createRoute({
  method: "get",
  path: "/api/v1/projects/{projectId}",
  tags: ["Project"],
  summary: "读取单个 Project",
  security: [{ bearerAuth: [] }],
  request: { params: projectParamsSchema },
  responses: {
    200: { content: { "application/json": { schema: projectItemResponseSchema } }, description: "查询成功" },
    400: RESPONSE_400,
    401: RESPONSE_401,
    404: RESPONSE_404,
  },
});

export const updateProjectRoute = createRoute({
  method: "patch",
  path: "/api/v1/projects/{projectId}",
  tags: ["Project"],
  summary: "更新 Project",
  description: "id / user_id / created_at / updated_at / archived_at 不可直接修改；归档只走 archive / unarchive。",
  security: [{ bearerAuth: [] }],
  request: {
    params: projectParamsSchema,
    body: { required: true, content: { "application/json": { schema: updateProjectRequestSchema } } },
  },
  responses: {
    200: { content: { "application/json": { schema: projectItemResponseSchema } }, description: "更新成功" },
    400: RESPONSE_400,
    401: RESPONSE_401,
    404: RESPONSE_404,
    409: { content: errorContent, description: "同一用户下 slug 已存在。" },
  },
});

export const archiveProjectRoute = createRoute({
  method: "post",
  path: "/api/v1/projects/{projectId}/archive",
  tags: ["Project"],
  summary: "归档 Project",
  description: "设置 archived_at。已归档时保持幂等，不重复写入。",
  security: [{ bearerAuth: [] }],
  request: { params: projectParamsSchema },
  responses: {
    200: { content: { "application/json": { schema: projectItemResponseSchema } }, description: "归档成功" },
    400: RESPONSE_400,
    401: RESPONSE_401,
    404: RESPONSE_404,
  },
});

export const unarchiveProjectRoute = createRoute({
  method: "post",
  path: "/api/v1/projects/{projectId}/unarchive",
  tags: ["Project"],
  summary: "取消归档 Project",
  description: "清空 archived_at。未归档时保持幂等，不重复写入。",
  security: [{ bearerAuth: [] }],
  request: { params: projectParamsSchema },
  responses: {
    200: { content: { "application/json": { schema: projectItemResponseSchema } }, description: "取消归档成功" },
    400: RESPONSE_400,
    401: RESPONSE_401,
    404: RESPONSE_404,
  },
});

export function registerProjectRoutes(app: OpenAPIHono<AppEnv>): void {
  app.openapi(listProjectsRoute, listProjects);
  app.openapi(createProjectRoute, createProject);
  app.openapi(getProjectRoute, getProject);
  app.openapi(updateProjectRoute, updateProject);
  app.openapi(archiveProjectRoute, archiveProject);
  app.openapi(unarchiveProjectRoute, unarchiveProject);
}
