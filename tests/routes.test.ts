import { SELF, env } from "cloudflare:test";
import { createRoute, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app";
import { readJson } from "./helpers";

const ORIGIN = "https://iris.test";

interface HealthBody {
  success: boolean;
  data: { status: string; service: string; timestamp: string };
}

interface ErrorBody {
  success: boolean;
  error: { code: string; message: string };
}

interface OpenApiDoc {
  paths: Record<string, { get?: { responses?: Record<string, unknown> } }>;
  components?: { schemas?: Record<string, unknown> };
}

describe("GET /health", () => {
  it("无需认证并返回 200 与统一成功响应", async () => {
    const response = await SELF.fetch(`${ORIGIN}/health`);
    expect(response.status).toBe(200);

    const body = await readJson<HealthBody>(response);
    expect(body.success).toBe(true);
    expect(body.data.status).toBe("ok");
    expect(body.data.service).toBe("iris-api");
    expect(Number.isNaN(Date.parse(body.data.timestamp))).toBe(false);
  });
});

describe("统一错误处理", () => {
  it.each([
    [400, "BAD_REQUEST"],
    [401, "UNAUTHORIZED"],
    [404, "NOT_FOUND"],
    [500, "INTERNAL_ERROR"],
  ] as const)("HTTPException(%s) 保留状态并隐藏异常正文", async (status, code) => {
    const app = createApp();
    const secret = "private-token-and-sql-details";
    app.get("/__probe/http-error", () => {
      throw new HTTPException(status, { message: secret, res: new Response(secret, { status }) });
    });
    const response = await app.request("/__probe/http-error", undefined, env);
    expect(response.status).toBe(status);
    if (status === 401) expect(response.headers.get("WWW-Authenticate")).toBe("Bearer");
    const text = await response.text();
    expect(text).not.toContain(secret);
    expect(JSON.parse(text)).toMatchObject({ success: false, error: { code } });
  });

  it("JSON 解析失败返回统一 400", async () => {
    const app = createApp();
    app.openapi(createRoute({
      method: "post",
      path: "/__probe/json",
      request: { body: {
        required: true,
        content: { "application/json": { schema: z.object({ name: z.string() }) } },
      } },
      responses: { 200: {
        description: "通过校验",
        content: { "application/json": { schema: z.object({ ok: z.boolean() }) } },
      } },
    }), (c) => c.json({ ok: true }, 200));
    const response = await app.request("/__probe/json", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{",
    }, env);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      success: false, error: { code: "BAD_REQUEST", message: "请求参数校验失败。" },
    });
  });

  it("未知路径返回统一 404", async () => {
    const response = await SELF.fetch(`${ORIGIN}/no-such-route`);
    expect(response.status).toBe(404);

    const body = await readJson<ErrorBody>(response);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("401 响应体不泄露原始 Token、Authorization 头或 SQL 细节", async () => {
    const rawToken = `iris_${"A".repeat(43)}`;
    const response = await SELF.fetch(`${ORIGIN}/api/v1/test`, {
      headers: { Authorization: `Bearer ${rawToken}` },
    });
    const text = await response.text();

    expect(response.status).toBe(401);
    expect(text).not.toContain(rawToken);
    expect(text).not.toContain("Authorization");
    expect(text).not.toContain("Bearer");
    expect(text.toLowerCase()).not.toContain("sql");
    expect(text.toLowerCase()).not.toContain("select ");
  });

  it("统一错误 schema 声明了全部业务错误码", async () => {
    const response = await SELF.fetch(`${ORIGIN}/openapi.json`);
    const doc = await readJson<OpenApiDoc>(response);

    const apiError = doc.components?.schemas?.["ApiError"] as
      | { properties?: { error?: { properties?: { code?: { enum?: string[] } } } } }
      | undefined;
    expect(apiError?.properties?.error?.properties?.code?.enum).toEqual([
      "BAD_REQUEST",
      "UNAUTHORIZED",
      "NOT_FOUND",
      "INTERNAL_ERROR",
      "PROJECT_NOT_FOUND",
      "MILESTONE_NOT_FOUND",
      "TASK_NOT_FOUND",
      "RESOURCE_NOT_FOUND",
      "CAPABILITY_NOT_FOUND",
      "SLUG_ALREADY_EXISTS",
      "INVALID_RESOURCE_SCOPE",
      "INVALID_RESOURCE_LOCATION",
      "INVALID_CAPABILITY_RESOURCE_KIND",
      "RESOURCE_IN_USE",
      "CONTENT_ALREADY_EXISTS",
      "CONTENT_NOT_FOUND",
      "CONTENT_CONFLICT",
      "CONTENT_TOO_LARGE",
      "RESOURCE_CONTENT_UNSUPPORTED",
      "CONTENT_PROVIDER_ERROR",
    ]);
  });

  // Phase 1 的两个路由都没有需要校验的输入，也没有故障注入点，
  // 因此 400 / 500 无法通过真实端点触发。这里在同一个 createApp() 实例上
  // 挂测试专用探针路由，验证的是生产代码里真实的 defaultHook 与 onError 链路。
  it("请求校验失败时由 defaultHook 返回统一 400", async () => {
    const app = createApp();
    app.openapi(
      createRoute({
        method: "get",
        path: "/__probe/validation",
        request: { query: z.object({ count: z.coerce.number() }) },
        responses: {
          200: {
            content: { "application/json": { schema: z.object({ ok: z.boolean() }) } },
            description: "通过校验",
          },
        },
      }),
      (c) => c.json({ ok: true }, 200),
    );

    const response = await app.request("/__probe/validation?count=not-a-number", undefined, env);
    expect(response.status).toBe(400);

    const body = (await response.json()) as ErrorBody;
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("BAD_REQUEST");
  });

  it("未捕获异常时由 onError 返回统一 500", async () => {
    const app = createApp();
    app.get("/__probe/boom", () => {
      throw new Error("probe failure");
    });

    const response = await app.request("/__probe/boom", undefined, env);
    expect(response.status).toBe(500);

    const body = (await response.json()) as ErrorBody;
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("INTERNAL_ERROR");
  });
});

describe("GET /openapi.json", () => {
  it("可访问并包含 /health、/api/v1/test 及认证错误 response schema", async () => {
    const response = await SELF.fetch(`${ORIGIN}/openapi.json`);
    expect(response.status).toBe(200);

    const doc = await readJson<OpenApiDoc>(response);
    expect(Object.keys(doc.paths)).toEqual(
      expect.arrayContaining(["/health", "/api/v1/test"]),
    );

    const testResponses = doc.paths["/api/v1/test"]?.get?.responses;
    expect(testResponses).toHaveProperty("200");
    expect(testResponses).toHaveProperty("401");

    const unauthorized = testResponses?.["401"] as
      | { content?: { "application/json"?: { schema?: { $ref?: string } } } }
      | undefined;
    expect(unauthorized?.content?.["application/json"]?.schema?.$ref).toBe(
      "#/components/schemas/ApiError",
    );

    expect(doc.paths["/health"]?.get?.responses).toHaveProperty("200");
  });
});

interface OpenApiOperation {
  security?: unknown[];
  parameters?: { name: string; in: string; required?: boolean }[];
  requestBody?: { required?: boolean; content?: Record<string, unknown> };
  responses?: Record<string, unknown>;
  tags?: string[];
}

interface FullOpenApiDoc {
  paths: Record<string, Record<string, OpenApiOperation>>;
}

/** Project 6 + Milestone 4 + Task 4 + Resource 8 + Capability 6 = 28 个业务操作。 */
const BUSINESS_OPERATIONS: [string, string][] = [
  ["get", "/api/v1/projects"],
  ["post", "/api/v1/projects"],
  ["get", "/api/v1/projects/{projectId}"],
  ["patch", "/api/v1/projects/{projectId}"],
  ["post", "/api/v1/projects/{projectId}/archive"],
  ["post", "/api/v1/projects/{projectId}/unarchive"],
  ["get", "/api/v1/projects/{projectId}/milestones"],
  ["post", "/api/v1/projects/{projectId}/milestones"],
  ["get", "/api/v1/projects/{projectId}/milestones/{milestoneId}"],
  ["patch", "/api/v1/projects/{projectId}/milestones/{milestoneId}"],
  ["get", "/api/v1/projects/{projectId}/tasks"],
  ["post", "/api/v1/projects/{projectId}/tasks"],
  ["get", "/api/v1/projects/{projectId}/tasks/{taskId}"],
  ["patch", "/api/v1/projects/{projectId}/tasks/{taskId}"],
  ["get", "/api/v1/projects/{projectId}/resources"],
  ["post", "/api/v1/projects/{projectId}/resources"],
  ["get", "/api/v1/projects/{projectId}/resources/{resourceId}"],
  ["patch", "/api/v1/projects/{projectId}/resources/{resourceId}"],
  ["delete", "/api/v1/projects/{projectId}/resources/{resourceId}"],
  ["post", "/api/v1/projects/{projectId}/resources/markdown"],
  ["get", "/api/v1/projects/{projectId}/resources/{resourceId}/content"],
  ["put", "/api/v1/projects/{projectId}/resources/{resourceId}/content"],
  ["get", "/api/v1/projects/{projectId}/capabilities"],
  ["post", "/api/v1/projects/{projectId}/capabilities"],
  ["get", "/api/v1/projects/{projectId}/capabilities/{capabilityId}"],
  ["patch", "/api/v1/projects/{projectId}/capabilities/{capabilityId}"],
  ["post", "/api/v1/projects/{projectId}/capabilities/{capabilityId}/enable"],
  ["post", "/api/v1/projects/{projectId}/capabilities/{capabilityId}/disable"],
];

describe("Phase 2 OpenAPI 覆盖", () => {
  it("声明全部 28 个业务操作且每个都要求 bearerAuth 与响应定义", async () => {
    const doc = await readJson<FullOpenApiDoc>(await SELF.fetch(`${ORIGIN}/openapi.json`));

    for (const [method, path] of BUSINESS_OPERATIONS) {
      const operation = doc.paths[path]?.[method];
      expect(operation, `${method.toUpperCase()} ${path} 缺失`).toBeDefined();
      expect(operation?.security, `${method.toUpperCase()} ${path} 缺少 bearerAuth`).toEqual([
        { bearerAuth: [] },
      ]);
      expect(Object.keys(operation?.responses ?? {}).length).toBeGreaterThan(0);
    }
  });

  it("路径参数与查询参数在文档中显式声明", async () => {
    const doc = await readJson<FullOpenApiDoc>(await SELF.fetch(`${ORIGIN}/openapi.json`));

    const projectItem = doc.paths["/api/v1/projects/{projectId}"]?.["get"];
    expect(projectItem?.parameters?.map((parameter) => parameter.name)).toEqual(["projectId"]);

    const capabilityList = doc.paths["/api/v1/projects/{projectId}/capabilities"]?.["get"];
    expect(capabilityList?.parameters?.map((parameter) => parameter.name).sort()).toEqual([
      "enabled",
      "projectId",
      "type",
    ]);

    const createResource = doc.paths["/api/v1/projects/{projectId}/resources"]?.["post"];
    expect(createResource?.requestBody?.required).toBe(true);
  });

  it("不声明任何未批准的 hard delete 或 Capability 执行操作", async () => {
    const doc = await readJson<FullOpenApiDoc>(await SELF.fetch(`${ORIGIN}/openapi.json`));

    const declared = new Set(
      Object.entries(doc.paths).flatMap(([path, methods]) =>
        Object.keys(methods).map((method) => `${method.toUpperCase()} ${path}`),
      ),
    );

    expect(declared).not.toContain("DELETE /api/v1/projects/{projectId}");
    expect(declared).not.toContain("DELETE /api/v1/projects/{projectId}/milestones/{milestoneId}");
    expect(declared).not.toContain("DELETE /api/v1/projects/{projectId}/tasks/{taskId}");
    expect(declared).not.toContain("DELETE /api/v1/projects/{projectId}/capabilities/{capabilityId}");

    for (const path of Object.keys(doc.paths)) {
      expect(path).not.toContain("execute");
      expect(path).not.toContain("run");
    }
  });
});
