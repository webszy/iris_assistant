import { createRoute } from "@hono/zod-openapi";
import type { OpenAPIHono } from "@hono/zod-openapi";

import { errorResponseSchema } from "../lib/response";
import {
  createMilestoneRequestSchema,
  milestoneItemResponseSchema,
  milestoneListQuerySchema,
  milestoneListResponseSchema,
  milestoneParamsSchema,
  updateMilestoneRequestSchema,
} from "../schemas/milestone";
import {
  createMilestone,
  getMilestone,
  listMilestones,
  updateMilestone,
} from "../controllers/milestones";
import type { AppEnv } from "../types/env";

const errorContent = { "application/json": { schema: errorResponseSchema } };

const RESPONSE_400 = { content: errorContent, description: "请求参数校验失败。" };
const RESPONSE_401 = { content: errorContent, description: "缺少或无效的访问令牌。" };
const RESPONSE_404 = {
  content: errorContent,
  description: "Project 或 Milestone 不存在，或不属于当前用户。",
};

export const listMilestonesRoute = createRoute({
  method: "get",
  path: "/api/v1/projects/{projectId}/milestones",
  tags: ["Milestone"],
  summary: "列出 Project 下的 Milestones",
  description: "按 position 升序返回；支持 status 过滤。不使用 created_at 推断顺序。",
  security: [{ bearerAuth: [] }],
  request: { params: milestoneParamsSchema.pick({ projectId: true }), query: milestoneListQuerySchema },
  responses: {
    200: {
      content: { "application/json": { schema: milestoneListResponseSchema } },
      description: "查询成功",
    },
    400: RESPONSE_400,
    401: RESPONSE_401,
    404: RESPONSE_404,
  },
});

export const createMilestoneRoute = createRoute({
  method: "post",
  path: "/api/v1/projects/{projectId}/milestones",
  tags: ["Milestone"],
  summary: "创建 Milestone",
  description: "project_id 来自 URL；未提供 position 时自动取该 Project 当前最大值 + 100。",
  security: [{ bearerAuth: [] }],
  request: {
    params: milestoneParamsSchema.pick({ projectId: true }),
    body: {
      required: true,
      content: { "application/json": { schema: createMilestoneRequestSchema } },
    },
  },
  responses: {
    201: {
      content: { "application/json": { schema: milestoneItemResponseSchema } },
      description: "创建成功",
    },
    400: RESPONSE_400,
    401: RESPONSE_401,
    404: RESPONSE_404,
  },
});

export const getMilestoneRoute = createRoute({
  method: "get",
  path: "/api/v1/projects/{projectId}/milestones/{milestoneId}",
  tags: ["Milestone"],
  summary: "读取单个 Milestone",
  security: [{ bearerAuth: [] }],
  request: { params: milestoneParamsSchema },
  responses: {
    200: {
      content: { "application/json": { schema: milestoneItemResponseSchema } },
      description: "查询成功",
    },
    400: RESPONSE_400,
    401: RESPONSE_401,
    404: RESPONSE_404,
  },
});

export const updateMilestoneRoute = createRoute({
  method: "patch",
  path: "/api/v1/projects/{projectId}/milestones/{milestoneId}",
  tags: ["Milestone"],
  summary: "更新 Milestone",
  description:
    "允许修改 name / description / status / position。v0.1 不提供 Milestone 删除路由，废弃阶段使用 status = cancelled。",
  security: [{ bearerAuth: [] }],
  request: {
    params: milestoneParamsSchema,
    body: {
      required: true,
      content: { "application/json": { schema: updateMilestoneRequestSchema } },
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: milestoneItemResponseSchema } },
      description: "更新成功",
    },
    400: RESPONSE_400,
    401: RESPONSE_401,
    404: RESPONSE_404,
  },
});

export function registerMilestoneRoutes(app: OpenAPIHono<AppEnv>): void {
  app.openapi(listMilestonesRoute, listMilestones);
  app.openapi(createMilestoneRoute, createMilestone);
  app.openapi(getMilestoneRoute, getMilestone);
  app.openapi(updateMilestoneRoute, updateMilestone);
}
