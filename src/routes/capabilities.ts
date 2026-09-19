import { createRoute } from "@hono/zod-openapi";
import type { OpenAPIHono } from "@hono/zod-openapi";

import { errorResponseSchema } from "../lib/response";
import {
  capabilityItemResponseSchema,
  capabilityListQuerySchema,
  capabilityListResponseSchema,
  capabilityParamsSchema,
  createCapabilityRequestSchema,
  updateCapabilityRequestSchema,
} from "../schemas/capability";
import {
  createCapability,
  disableCapability,
  enableCapability,
  getCapability,
  listCapabilities,
  updateCapability,
} from "../controllers/capabilities";
import type { AppEnv } from "../types/env";

const errorContent = { "application/json": { schema: errorResponseSchema } };

const RESPONSE_400 = { content: errorContent, description: "请求参数校验失败。" };
const RESPONSE_401 = { content: errorContent, description: "缺少或无效的访问令牌。" };
const RESPONSE_404 = {
  content: errorContent,
  description: "Project / Capability / Resource 不存在，或不属于当前用户与 URL Project。",
};

export const listCapabilitiesRoute = createRoute({
  method: "get",
  path: "/api/v1/projects/{projectId}/capabilities",
  tags: ["Capability"],
  summary: "列出 Project 下的 Capabilities",
  description: "按 created_at 升序返回；支持 type 与 enabled 过滤。本阶段只做注册，不执行 Capability。",
  security: [{ bearerAuth: [] }],
  request: {
    params: capabilityParamsSchema.pick({ projectId: true }),
    query: capabilityListQuerySchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: capabilityListResponseSchema } },
      description: "查询成功",
    },
    400: RESPONSE_400,
    401: RESPONSE_401,
    404: RESPONSE_404,
  },
});

export const createCapabilityRoute = createRoute({
  method: "post",
  path: "/api/v1/projects/{projectId}/capabilities",
  tags: ["Capability"],
  summary: "注册 Capability",
  description:
    "resource_id 必填且必须同用户同 Project；type = script 要求 Resource kind = file，type = skill 要求 kind = directory。默认 enabled = true。",
  security: [{ bearerAuth: [] }],
  request: {
    params: capabilityParamsSchema.pick({ projectId: true }),
    body: {
      required: true,
      content: { "application/json": { schema: createCapabilityRequestSchema } },
    },
  },
  responses: {
    201: {
      content: { "application/json": { schema: capabilityItemResponseSchema } },
      description: "注册成功",
    },
    400: RESPONSE_400,
    401: RESPONSE_401,
    404: RESPONSE_404,
    422: { content: errorContent, description: "Capability.type 与 Resource.kind 不匹配。" },
  },
});

export const getCapabilityRoute = createRoute({
  method: "get",
  path: "/api/v1/projects/{projectId}/capabilities/{capabilityId}",
  tags: ["Capability"],
  summary: "读取单个 Capability",
  security: [{ bearerAuth: [] }],
  request: { params: capabilityParamsSchema },
  responses: {
    200: {
      content: { "application/json": { schema: capabilityItemResponseSchema } },
      description: "查询成功",
    },
    400: RESPONSE_400,
    401: RESPONSE_401,
    404: RESPONSE_404,
  },
});

export const updateCapabilityRoute = createRoute({
  method: "patch",
  path: "/api/v1/projects/{projectId}/capabilities/{capabilityId}",
  tags: ["Capability"],
  summary: "更新 Capability",
  description:
    "允许修改 name / description / type / resource_id / enabled。type 或 resource_id 变化时重新执行 Resource 归属与 kind 校验。",
  security: [{ bearerAuth: [] }],
  request: {
    params: capabilityParamsSchema,
    body: {
      required: true,
      content: { "application/json": { schema: updateCapabilityRequestSchema } },
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: capabilityItemResponseSchema } },
      description: "更新成功",
    },
    400: RESPONSE_400,
    401: RESPONSE_401,
    404: RESPONSE_404,
    422: { content: errorContent, description: "Capability.type 与 Resource.kind 不匹配。" },
  },
});

export const enableCapabilityRoute = createRoute({
  method: "post",
  path: "/api/v1/projects/{projectId}/capabilities/{capabilityId}/enable",
  tags: ["Capability"],
  summary: "启用 Capability",
  description: "设置 enabled = true，已启用时保持幂等。",
  security: [{ bearerAuth: [] }],
  request: { params: capabilityParamsSchema },
  responses: {
    200: {
      content: { "application/json": { schema: capabilityItemResponseSchema } },
      description: "启用成功",
    },
    400: RESPONSE_400,
    401: RESPONSE_401,
    404: RESPONSE_404,
  },
});

export const disableCapabilityRoute = createRoute({
  method: "post",
  path: "/api/v1/projects/{projectId}/capabilities/{capabilityId}/disable",
  tags: ["Capability"],
  summary: "禁用 Capability",
  description: "设置 enabled = false，已禁用时保持幂等。禁用不解除 Resource 引用保护。",
  security: [{ bearerAuth: [] }],
  request: { params: capabilityParamsSchema },
  responses: {
    200: {
      content: { "application/json": { schema: capabilityItemResponseSchema } },
      description: "禁用成功",
    },
    400: RESPONSE_400,
    401: RESPONSE_401,
    404: RESPONSE_404,
  },
});

export function registerCapabilityRoutes(app: OpenAPIHono<AppEnv>): void {
  app.openapi(listCapabilitiesRoute, listCapabilities);
  app.openapi(createCapabilityRoute, createCapability);
  app.openapi(getCapabilityRoute, getCapability);
  app.openapi(updateCapabilityRoute, updateCapability);
  app.openapi(enableCapabilityRoute, enableCapability);
  app.openapi(disableCapabilityRoute, disableCapability);
}
