import { createRoute, z } from "@hono/zod-openapi";
import type { OpenAPIHono } from "@hono/zod-openapi";

import { errorResponseSchema } from "../lib/response";
import { getAuthenticatedTest } from "../controllers/test";
import type { AppEnv } from "../types/env";

const authenticatedUserSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    timezone: z.string(),
    locale: z.string(),
    defaultCurrency: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("AuthenticatedUser");

const testResponseSchema = z
  .object({
    success: z.literal(true),
    data: z.object({
      message: z.string(),
      user: authenticatedUserSchema,
      tokenId: z.string(),
      requestedAt: z.string(),
    }),
  })
  .openapi("TestResponse");

export const testRoute = createRoute({
  method: "get",
  path: "/api/v1/test",
  tags: ["System"],
  summary: "受保护的测试路由",
  description:
    "必须携带 `Authorization: Bearer <token>`。返回的当前用户完全来自 Token 关联记录，忽略任何客户端传入的 user_id。",
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      content: { "application/json": { schema: testResponseSchema } },
      description: "认证通过",
    },
    401: {
      content: { "application/json": { schema: errorResponseSchema } },
      description: "缺少、格式错误、未知、已撤销或已过期的 Token",
    },
  },
});

export function registerTestRoute(app: OpenAPIHono<AppEnv>): void {
  app.openapi(testRoute, getAuthenticatedTest);
}
