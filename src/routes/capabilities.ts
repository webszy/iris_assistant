import { createRoute } from "@hono/zod-openapi";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { and, asc, eq, exists, sql } from "drizzle-orm";

import { createDb, type Database } from "../db";
import { capabilities, resources, type CapabilityRow } from "../db/schema";
import { ERROR_CODES, errorResponse, errorResponseSchema } from "../lib/response";
import { nowEpochMs, toIso8601Utc } from "../lib/time";
import {
  capabilityItemResponseSchema,
  capabilityListQuerySchema,
  capabilityListResponseSchema,
  capabilityParamsSchema,
  type CapabilityType,
  createCapabilityRequestSchema,
  updateCapabilityRequestSchema,
} from "../schemas/capability";
import { findUserProject } from "./projects";
import { isCapabilityTypeCompatibleWithResourceKind } from "./resources";
import type { AppEnv } from "../types/env";

const errorContent = { "application/json": { schema: errorResponseSchema } };

const RESPONSE_400 = { content: errorContent, description: "请求参数校验失败。" };
const RESPONSE_401 = { content: errorContent, description: "缺少或无效的访问令牌。" };
const RESPONSE_404 = {
  content: errorContent,
  description: "Project / Capability / Resource 不存在，或不属于当前用户与 URL Project。",
};

/** Capability 必须同时属于当前用户和 URL 中的 Project。 */
export async function findUserCapability(
  db: Database,
  userId: string,
  projectId: string,
  capabilityId: string,
): Promise<CapabilityRow | undefined> {
  const rows = await db
    .select()
    .from(capabilities)
    .where(
      and(
        eq(capabilities.id, capabilityId),
        eq(capabilities.userId, userId),
        eq(capabilities.projectId, projectId),
      ),
    )
    .limit(1);
  return rows[0];
}

export function toCapabilityResponse(row: CapabilityRow) {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    description: row.description,
    type: row.type as CapabilityType,
    resourceId: row.resourceId,
    enabled: row.enabled,
    createdAt: toIso8601Utc(row.createdAt),
    updatedAt: toIso8601Utc(row.updatedAt),
  };
}

function mustFind(row: CapabilityRow | undefined): CapabilityRow {
  if (row === undefined) {
    throw new Error("capability row unexpectedly missing after write");
  }
  return row;
}

const listCapabilitiesRoute = createRoute({
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

const createCapabilityRoute = createRoute({
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

const getCapabilityRoute = createRoute({
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

const updateCapabilityRoute = createRoute({
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

const enableCapabilityRoute = createRoute({
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

const disableCapabilityRoute = createRoute({
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
  app.openapi(listCapabilitiesRoute, async (c) => {
    const db = createDb(c.env.DB);
    const userId = c.get("user").id;
    const { projectId } = c.req.valid("param");
    const query = c.req.valid("query");

    const project = await findUserProject(db, userId, projectId);
    if (project === undefined) {
      return c.json(errorResponse(ERROR_CODES.PROJECT_NOT_FOUND, "Project 不存在。"), 404);
    }

    const filters = [eq(capabilities.userId, userId), eq(capabilities.projectId, projectId)];
    if (query.type !== undefined) filters.push(eq(capabilities.type, query.type));
    if (query.enabled !== undefined) {
      filters.push(eq(capabilities.enabled, query.enabled === "true"));
    }

    const rows = await db
      .select()
      .from(capabilities)
      .where(and(...filters))
      .orderBy(asc(capabilities.createdAt));

    return c.json({ success: true as const, data: rows.map(toCapabilityResponse) }, 200);
  });

  app.openapi(createCapabilityRoute, async (c) => {
    const db = createDb(c.env.DB);
    const userId = c.get("user").id;
    const { projectId } = c.req.valid("param");
    const body = c.req.valid("json");

    if (await findUserProject(db, userId, projectId) === undefined) {
      return c.json(errorResponse(ERROR_CODES.PROJECT_NOT_FOUND, "Project 不存在。"), 404);
    }
    const resourceScope = and(
      eq(resources.id, body.resource_id),
      eq(resources.userId, userId),
      eq(resources.projectId, projectId),
    );
    const id = crypto.randomUUID();
    const now = nowEpochMs();

    // INSERT ... SELECT 在写入时校验 Resource；batch 同时提供一致的错误分类快照。
    const [target, written] = await db.batch([
      db.select({ kind: resources.kind }).from(resources).where(resourceScope).limit(1),
      db.insert(capabilities).select(
        db.select({
          id: sql<string>`${id}`.as("id"),
          userId: sql<string>`${userId}`.as("user_id"),
          projectId: sql<string>`${projectId}`.as("project_id"),
          name: sql<string>`${body.name}`.as("name"),
          description: sql<string | null>`${body.description ?? null}`.as("description"),
          type: sql<string>`${body.type}`.as("type"),
          resourceId: resources.id,
          enabled: sql<boolean>`${body.enabled === false ? 0 : 1}`.as("enabled"),
          createdAt: sql<number>`${now}`.as("created_at"),
          updatedAt: sql<number>`${now}`.as("updated_at"),
        }).from(resources).where(and(
          resourceScope,
          eq(resources.kind, body.type === "script" ? "file" : "directory"),
        )),
      ).returning(),
    ]);
    if (target[0] === undefined) {
      return c.json(errorResponse(ERROR_CODES.RESOURCE_NOT_FOUND, "Resource 不存在。"), 404);
    }
    if (!isCapabilityTypeCompatibleWithResourceKind(body.type, target[0].kind)) {
      return c.json(errorResponse(
        ERROR_CODES.INVALID_CAPABILITY_RESOURCE_KIND,
        "Capability type 与 Resource kind 不匹配。",
      ), 422);
    }
    return c.json({ success: true as const, data: toCapabilityResponse(mustFind(written[0])) }, 201);
  });

  app.openapi(getCapabilityRoute, async (c) => {
    const db = createDb(c.env.DB);
    const { projectId, capabilityId } = c.req.valid("param");

    const capability = await findUserCapability(db, c.get("user").id, projectId, capabilityId);
    if (capability === undefined) {
      return c.json(errorResponse(ERROR_CODES.CAPABILITY_NOT_FOUND, "Capability 不存在。"), 404);
    }
    return c.json({ success: true as const, data: toCapabilityResponse(capability) }, 200);
  });

  app.openapi(updateCapabilityRoute, async (c) => {
    const db = createDb(c.env.DB);
    const userId = c.get("user").id;
    const { projectId, capabilityId } = c.req.valid("param");
    const body = c.req.valid("json");
    const scope = and(
      eq(capabilities.id, capabilityId),
      eq(capabilities.userId, userId),
      eq(capabilities.projectId, projectId),
    );
    const nextResourceId = body.resource_id === undefined
      ? sql`${capabilities.resourceId}` : sql`${body.resource_id}`;
    const nextType = body.type === undefined ? sql`${capabilities.type}` : sql`${body.type}`;
    const resourceScope = and(
      eq(resources.id, nextResourceId),
      eq(resources.userId, userId),
      eq(resources.projectId, projectId),
    );
    const validResource = db.select({ id: resources.id }).from(resources).where(and(
      resourceScope,
      sql`((${nextType} = 'script' and ${resources.kind} = 'file')
        or (${nextType} = 'skill' and ${resources.kind} = 'directory'))`,
    ));

    // type/resource_id 使用当前列与本次 body 的组合，避免并发 PATCH 各自校验旧组合。
    const [before, target, written] = await db.batch([
      db.select().from(capabilities).where(scope).limit(1),
      db.select({ kind: resources.kind }).from(resources)
        .innerJoin(capabilities, scope).where(resourceScope).limit(1),
      db.update(capabilities).set({
        name: body.name,
        description: body.description,
        type: body.type,
        resourceId: body.resource_id,
        enabled: body.enabled,
        updatedAt: nowEpochMs(),
      }).where(and(scope, exists(validResource))).returning(),
    ]);
    const current = before[0];
    if (current === undefined) {
      return c.json(errorResponse(ERROR_CODES.CAPABILITY_NOT_FOUND, "Capability 不存在。"), 404);
    }
    if (target[0] === undefined) {
      return c.json(errorResponse(ERROR_CODES.RESOURCE_NOT_FOUND, "Resource 不存在。"), 404);
    }
    if (!isCapabilityTypeCompatibleWithResourceKind(body.type ?? current.type, target[0].kind)) {
      return c.json(errorResponse(
        ERROR_CODES.INVALID_CAPABILITY_RESOURCE_KIND,
        "Capability type 与 Resource kind 不匹配。",
      ), 422);
    }
    return c.json({ success: true as const, data: toCapabilityResponse(mustFind(written[0])) }, 200);
  });

  app.openapi(enableCapabilityRoute, async (c) => {
    const db = createDb(c.env.DB);
    const userId = c.get("user").id;
    const { projectId, capabilityId } = c.req.valid("param");

    const capability = await findUserCapability(db, userId, projectId, capabilityId);
    if (capability === undefined) {
      return c.json(errorResponse(ERROR_CODES.CAPABILITY_NOT_FOUND, "Capability 不存在。"), 404);
    }
    if (capability.enabled) {
      return c.json({ success: true as const, data: toCapabilityResponse(capability) }, 200);
    }

    const now = nowEpochMs();
    await db
      .update(capabilities)
      .set({ enabled: true, updatedAt: now })
      .where(
        and(
          eq(capabilities.id, capabilityId),
          eq(capabilities.userId, userId),
          eq(capabilities.projectId, projectId),
        ),
      );

    const updated = mustFind(await findUserCapability(db, userId, projectId, capabilityId));
    return c.json({ success: true as const, data: toCapabilityResponse(updated) }, 200);
  });

  app.openapi(disableCapabilityRoute, async (c) => {
    const db = createDb(c.env.DB);
    const userId = c.get("user").id;
    const { projectId, capabilityId } = c.req.valid("param");

    const capability = await findUserCapability(db, userId, projectId, capabilityId);
    if (capability === undefined) {
      return c.json(errorResponse(ERROR_CODES.CAPABILITY_NOT_FOUND, "Capability 不存在。"), 404);
    }
    if (!capability.enabled) {
      return c.json({ success: true as const, data: toCapabilityResponse(capability) }, 200);
    }

    const now = nowEpochMs();
    await db
      .update(capabilities)
      .set({ enabled: false, updatedAt: now })
      .where(
        and(
          eq(capabilities.id, capabilityId),
          eq(capabilities.userId, userId),
          eq(capabilities.projectId, projectId),
        ),
      );

    const updated = mustFind(await findUserCapability(db, userId, projectId, capabilityId));
    return c.json({ success: true as const, data: toCapabilityResponse(updated) }, 200);
  });
}
