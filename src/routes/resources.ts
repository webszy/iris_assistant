import { createRoute } from "@hono/zod-openapi";
import type { OpenAPIHono } from "@hono/zod-openapi";

import { errorResponseSchema } from "../lib/response";
import {
  createResourceRequestSchema,
  resourceItemResponseSchema,
  resourceListQuerySchema,
  resourceListResponseSchema,
  resourceParamsSchema,
  updateResourceRequestSchema,
} from "../schemas/resource";
import {
  createResource,
  deleteResource,
  getResource,
  listResources,
  updateResource,
} from "../controllers/resources";
import type { AppEnv } from "../types/env";

const errorContent = { "application/json": { schema: errorResponseSchema } };

const RESPONSE_400 = { content: errorContent, description: "请求参数校验失败。" };
const RESPONSE_401 = { content: errorContent, description: "缺少或无效的访问令牌。" };
const RESPONSE_404 = {
  content: errorContent,
  description: "Project / Milestone / Task / Resource 不存在，或不属于当前用户与 URL Project。",
};

export const listResourcesRoute = createRoute({
  method: "get",
  path: "/api/v1/projects/{projectId}/resources",
  tags: ["Resource"],
  summary: "列出 Project 下的 Resource metadata",
  description: "只返回 metadata；支持 kind / role / milestone_id / task_id 过滤。",
  security: [{ bearerAuth: [] }],
  request: { params: resourceParamsSchema.pick({ projectId: true }), query: resourceListQuerySchema },
  responses: {
    200: {
      content: { "application/json": { schema: resourceListResponseSchema } },
      description: "查询成功",
    },
    400: RESPONSE_400,
    401: RESPONSE_401,
    404: RESPONSE_404,
  },
});

export const createResourceRoute = createRoute({
  method: "post",
  path: "/api/v1/projects/{projectId}/resources",
  tags: ["Resource"],
  summary: "创建 Resource metadata",
  description:
    "project_id 来自 URL。milestone_id 与 task_id 互斥；kind 决定 repository / path / url 的必填组合。不访问 Git 或 URL 内容。",
  security: [{ bearerAuth: [] }],
  request: {
    params: resourceParamsSchema.pick({ projectId: true }),
    body: {
      required: true,
      content: { "application/json": { schema: createResourceRequestSchema } },
    },
  },
  responses: {
    201: {
      content: { "application/json": { schema: resourceItemResponseSchema } },
      description: "创建成功",
    },
    400: RESPONSE_400,
    401: RESPONSE_401,
    404: RESPONSE_404,
    422: { content: errorContent, description: "归属互斥或 kind 与 location 不匹配。" },
  },
});

export const getResourceRoute = createRoute({
  method: "get",
  path: "/api/v1/projects/{projectId}/resources/{resourceId}",
  tags: ["Resource"],
  summary: "读取单个 Resource metadata",
  security: [{ bearerAuth: [] }],
  request: { params: resourceParamsSchema },
  responses: {
    200: {
      content: { "application/json": { schema: resourceItemResponseSchema } },
      description: "查询成功",
    },
    400: RESPONSE_400,
    401: RESPONSE_401,
    404: RESPONSE_404,
  },
});

export const updateResourceRoute = createRoute({
  method: "patch",
  path: "/api/v1/projects/{projectId}/resources/{resourceId}",
  tags: ["Resource"],
  summary: "更新 Resource metadata",
  description:
    "任何修改都会在合并后的完整记录上重新执行归属、location 与引用校验。若 kind 变更会破坏已有 Capability 关系，返回 422 且不写入。仅修改/重新绑定 metadata pointer；不移动、重命名、创建或删除 Git 内容。",
  security: [{ bearerAuth: [] }],
  request: {
    params: resourceParamsSchema,
    body: {
      required: true,
      content: { "application/json": { schema: updateResourceRequestSchema } },
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: resourceItemResponseSchema } },
      description: "更新成功",
    },
    400: RESPONSE_400,
    401: RESPONSE_401,
    404: RESPONSE_404,
    422: { content: errorContent, description: "归属互斥、location 不匹配或破坏已有 Capability 关系。" },
  },
});

export const deleteResourceRoute = createRoute({
  method: "delete",
  path: "/api/v1/projects/{projectId}/resources/{resourceId}",
  tags: ["Resource"],
  summary: "删除 Resource metadata",
  description:
    "只删除 Iris DB 中的 metadata，不删除 Git 文件、不调用 GitHub API、不删除 URL 内容。被任一 Capability 引用（含 disabled）时返回 409。",
  security: [{ bearerAuth: [] }],
  request: { params: resourceParamsSchema },
  responses: {
    204: { description: "删除成功，无响应体" },
    400: RESPONSE_400,
    401: RESPONSE_401,
    404: RESPONSE_404,
    409: { content: errorContent, description: "仍被 Capability 引用。" },
  },
});

export function registerResourceRoutes(app: OpenAPIHono<AppEnv>): void {
  app.openapi(listResourcesRoute, listResources);
  app.openapi(createResourceRoute, createResource);
  app.openapi(getResourceRoute, getResource);
  app.openapi(updateResourceRoute, updateResource);
  app.openapi(deleteResourceRoute, deleteResource);
}
