import { OpenAPIHono } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";

import { ERROR_CODES, errorResponse } from "./lib/response";
import { ServiceError } from "./lib/service-error";
import { SERVICE_ERROR_STATUS } from "./controllers/service-errors";
import { requireBearerAuth } from "./middleware/auth";
import { registerCapabilityRoutes } from "./routes/capabilities";
import { registerHealthRoute } from "./routes/health";
import { registerMilestoneRoutes } from "./routes/milestones";
import { registerProjectRoutes } from "./routes/projects";
import { registerResourceRoutes } from "./routes/resources";
import { registerResourceContentRoutes } from "./routes/resource-content";
import { registerTaskRoutes } from "./routes/tasks";
import { registerTestRoute } from "./routes/test";
import type { AppEnv } from "./types/env";

export function createApp(): OpenAPIHono<AppEnv> {
  const app = new OpenAPIHono<AppEnv>({
    // 统一处理请求校验失败（400）。
    defaultHook: (result, c) =>
      result.success
        ? undefined
        : c.json(errorResponse(ERROR_CODES.BAD_REQUEST, "请求参数校验失败。"), 400),
  });

  app.openAPIRegistry.registerComponent("securitySchemes", "bearerAuth", {
    type: "http",
    scheme: "bearer",
  });

  // 受保护路径必须先经过认证中间件；身份由中间件写入 Context。
  // 精确路径与子路径都要挂载，避免 /api/v1/projects 本身漏过认证。
  app.use("/api/v1/test", requireBearerAuth);
  app.use("/api/v1/projects", requireBearerAuth);
  app.use("/api/v1/projects/*", requireBearerAuth);

  registerHealthRoute(app);
  registerTestRoute(app);
  registerProjectRoutes(app);
  registerMilestoneRoutes(app);
  registerTaskRoutes(app);
  registerResourceContentRoutes(app);
  registerResourceRoutes(app);
  registerCapabilityRoutes(app);

  app.doc("/openapi.json", {
    openapi: "3.0.0",
    info: { title: "Iris API", version: "0.1.0" },
  });

  app.notFound((c) => c.json(errorResponse(ERROR_CODES.NOT_FOUND, "请求的资源不存在。"), 404));

  app.onError((err, c) => {
    if (err instanceof ServiceError) {
      return c.json(errorResponse(err.code, err.message), SERVICE_ERROR_STATUS[err.code]);
    }
    // 保留已支持的 HTTP 状态，但不回传异常携带的正文或内部信息。
    if (err instanceof HTTPException) {
      switch (err.status) {
        case 400:
          return c.json(errorResponse(ERROR_CODES.BAD_REQUEST, "请求参数校验失败。"), 400);
        case 401:
          c.header("WWW-Authenticate", "Bearer");
          return c.json(errorResponse(ERROR_CODES.UNAUTHORIZED, "认证失败：请提供有效的访问令牌。"), 401);
        case 404:
          return c.json(errorResponse(ERROR_CODES.NOT_FOUND, "请求的资源不存在。"), 404);
      }
    }
    // 只记录错误类型名，绝不记录 err.message：
    // D1/SQL 的错误信息可能包含 SQL 内部细节，日志同样受不泄露约束。
    console.error("[iris-api] unhandled error:", err.name);
    return c.json(errorResponse(ERROR_CODES.INTERNAL_ERROR, "服务器内部错误。"), 500);
  });

  return app;
}
