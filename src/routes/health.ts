import { createRoute, z } from "@hono/zod-openapi";
import type { OpenAPIHono } from "@hono/zod-openapi";

import { nowEpochMs, toIso8601Utc } from "../lib/time";
import type { AppEnv } from "../types/env";

const healthResponseSchema = z
  .object({
    success: z.literal(true),
    data: z.object({
      status: z.literal("ok"),
      service: z.string(),
      timestamp: z.string(),
    }),
  })
  .openapi("HealthResponse");

export const healthRoute = createRoute({
  method: "get",
  path: "/health",
  tags: ["System"],
  summary: "公开健康检查",
  description: "无需认证。",
  responses: {
    200: {
      content: { "application/json": { schema: healthResponseSchema } },
      description: "服务可用",
    },
  },
});

export function registerHealthRoute(app: OpenAPIHono<AppEnv>): void {
  app.openapi(healthRoute, (c) =>
    c.json(
      {
        success: true,
        data: {
          status: "ok",
          service: "iris-api",
          timestamp: toIso8601Utc(nowEpochMs()),
        },
      },
      200,
    ),
  );
}
