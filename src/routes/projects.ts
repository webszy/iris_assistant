import { createRoute } from "@hono/zod-openapi";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { and, desc, eq, isNull } from "drizzle-orm";

import { createDb, type Database } from "../db";
import { projects, type ProjectRow } from "../db/schema";
import { ERROR_CODES, errorResponse, errorResponseSchema } from "../lib/response";
import { nowEpochMs, toIso8601Utc } from "../lib/time";
import {
  createProjectRequestSchema,
  projectItemResponseSchema,
  projectListQuerySchema,
  projectListResponseSchema,
  projectParamsSchema,
  type ProjectKind,
  type ProjectStatus,
  updateProjectRequestSchema,
} from "../schemas/project";
import type { AppEnv } from "../types/env";

const errorContent = { "application/json": { schema: errorResponseSchema } };

const RESPONSE_400 = { content: errorContent, description: "请求参数校验失败。" };
const RESPONSE_401 = { content: errorContent, description: "缺少或无效的访问令牌。" };
const RESPONSE_404 = { content: errorContent, description: "Project 不存在或不属于当前用户。" };

/**
 * 只按 (id, user_id) 查询：不属于当前用户的 Project 与不存在的 Project 返回同一结果，
 * 不泄漏另一个用户是否拥有该 Project。Milestone / Task / Resource / Capability
 * 路由复用此函数做 URL Project 归属校验。
 */
export async function findUserProject(
  db: Database,
  userId: string,
  projectId: string,
): Promise<ProjectRow | undefined> {
  const rows = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1);
  return rows[0];
}

/** 数据库行 -> 对外表示；时间统一输出 ISO 8601 UTC，可空时间保留 null。 */
export function toProjectResponse(row: ProjectRow) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    kind: row.kind as ProjectKind,
    status: row.status as ProjectStatus,
    createdAt: toIso8601Utc(row.createdAt),
    updatedAt: toIso8601Utc(row.updatedAt),
    archivedAt: row.archivedAt === null ? null : toIso8601Utc(row.archivedAt),
  };
}

/**
 * 刚写入的行必然存在；缺失说明出现了不该发生的状态，交给统一 onError 返回 500，
 * 而不是把内部异常当成正常响应分支声明到 OpenAPI 里。
 */
function mustFind(row: ProjectRow | undefined): ProjectRow {
  if (row === undefined) {
    throw new Error("project row unexpectedly missing after write");
  }
  return row;
}

async function slugTaken(db: Database, userId: string, slug: string): Promise<boolean> {
  const rows = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.userId, userId), eq(projects.slug, slug)))
    .limit(1);
  return rows.length > 0;
}

/** Drizzle/D1 会包装原始 SQLite 错误；只将这一项唯一约束映射为 slug 冲突。 */
function isSlugConflict(error: unknown): boolean {
  const seen = new Set<unknown>();
  while (error instanceof Error && !seen.has(error)) {
    seen.add(error);
    if (/^(?:D1_ERROR: )?UNIQUE constraint failed: projects\.user_id, projects\.slug(?:\b|$)/.test(error.message)) {
      return true;
    }
    error = error.cause;
  }
  return false;
}

const listProjectsRoute = createRoute({
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

const createProjectRoute = createRoute({
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

const getProjectRoute = createRoute({
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

const updateProjectRoute = createRoute({
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

const archiveProjectRoute = createRoute({
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

const unarchiveProjectRoute = createRoute({
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
  app.openapi(listProjectsRoute, async (c) => {
    const db = createDb(c.env.DB);
    const userId = c.get("user").id;
    const query = c.req.valid("query");

    const filters = [eq(projects.userId, userId)];
    if (query.status !== undefined) filters.push(eq(projects.status, query.status));
    if (query.kind !== undefined) filters.push(eq(projects.kind, query.kind));
    if (query.include_archived !== "true") {
      filters.push(isNull(projects.archivedAt));
    }

    const rows = await db
      .select()
      .from(projects)
      .where(and(...filters))
      .orderBy(desc(projects.createdAt));

    return c.json({ success: true as const, data: rows.map(toProjectResponse) }, 200);
  });

  app.openapi(createProjectRoute, async (c) => {
    const db = createDb(c.env.DB);
    const userId = c.get("user").id;
    const body = c.req.valid("json");

    if (await slugTaken(db, userId, body.slug)) {
      return c.json(errorResponse(ERROR_CODES.SLUG_ALREADY_EXISTS, "该 slug 已被当前用户的其他 Project 使用。"), 409);
    }

    const id = crypto.randomUUID();
    const now = nowEpochMs();

    try {
      await db.insert(projects).values({
        id,
        userId,
        name: body.name,
        slug: body.slug,
        description: body.description ?? null,
        kind: body.kind ?? "other",
        status: body.status ?? "planned",
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
      });
    } catch (error) {
      if (!isSlugConflict(error)) throw error;
      return c.json(errorResponse(ERROR_CODES.SLUG_ALREADY_EXISTS, "该 slug 已被当前用户的其他 Project 使用。"), 409);
    }

    const created = mustFind(await findUserProject(db, userId, id));
    return c.json({ success: true as const, data: toProjectResponse(created) }, 201);
  });

  app.openapi(getProjectRoute, async (c) => {
    const db = createDb(c.env.DB);
    const { projectId } = c.req.valid("param");
    const project = await findUserProject(db, c.get("user").id, projectId);
    if (project === undefined) {
      return c.json(errorResponse(ERROR_CODES.PROJECT_NOT_FOUND, "Project 不存在。"), 404);
    }
    return c.json({ success: true as const, data: toProjectResponse(project) }, 200);
  });

  app.openapi(updateProjectRoute, async (c) => {
    const db = createDb(c.env.DB);
    const userId = c.get("user").id;
    const { projectId } = c.req.valid("param");
    const body = c.req.valid("json");

    const project = await findUserProject(db, userId, projectId);
    if (project === undefined) {
      return c.json(errorResponse(ERROR_CODES.PROJECT_NOT_FOUND, "Project 不存在。"), 404);
    }

    if (body.slug !== undefined && body.slug !== project.slug) {
      if (await slugTaken(db, userId, body.slug)) {
        return c.json(errorResponse(ERROR_CODES.SLUG_ALREADY_EXISTS, "该 slug 已被当前用户的其他 Project 使用。"), 409);
      }
    }

    const patch: Partial<typeof projects.$inferInsert> = { updatedAt: nowEpochMs() };
    if (body.name !== undefined) patch.name = body.name;
    if (body.slug !== undefined) patch.slug = body.slug;
    if (body.description !== undefined) patch.description = body.description;
    if (body.kind !== undefined) patch.kind = body.kind;
    if (body.status !== undefined) patch.status = body.status;

    try {
      await db.update(projects).set(patch).where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
    } catch (error) {
      if (!isSlugConflict(error)) throw error;
      return c.json(errorResponse(ERROR_CODES.SLUG_ALREADY_EXISTS, "该 slug 已被当前用户的其他 Project 使用。"), 409);
    }

    const updated = mustFind(await findUserProject(db, userId, projectId));
    return c.json({ success: true as const, data: toProjectResponse(updated) }, 200);
  });

  app.openapi(archiveProjectRoute, async (c) => {
    const db = createDb(c.env.DB);
    const userId = c.get("user").id;
    const { projectId } = c.req.valid("param");

    const project = await findUserProject(db, userId, projectId);
    if (project === undefined) {
      return c.json(errorResponse(ERROR_CODES.PROJECT_NOT_FOUND, "Project 不存在。"), 404);
    }

    if (project.archivedAt !== null) {
      return c.json({ success: true as const, data: toProjectResponse(project) }, 200);
    }

    const now = nowEpochMs();
    await db
      .update(projects)
      .set({ archivedAt: now, updatedAt: now })
      .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));

    const archived = mustFind(await findUserProject(db, userId, projectId));
    return c.json({ success: true as const, data: toProjectResponse(archived) }, 200);
  });

  app.openapi(unarchiveProjectRoute, async (c) => {
    const db = createDb(c.env.DB);
    const userId = c.get("user").id;
    const { projectId } = c.req.valid("param");

    const project = await findUserProject(db, userId, projectId);
    if (project === undefined) {
      return c.json(errorResponse(ERROR_CODES.PROJECT_NOT_FOUND, "Project 不存在。"), 404);
    }

    if (project.archivedAt === null) {
      return c.json({ success: true as const, data: toProjectResponse(project) }, 200);
    }

    const now = nowEpochMs();
    await db
      .update(projects)
      .set({ archivedAt: null, updatedAt: now })
      .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));

    const restored = mustFind(await findUserProject(db, userId, projectId));
    return c.json({ success: true as const, data: toProjectResponse(restored) }, 200);
  });
}
