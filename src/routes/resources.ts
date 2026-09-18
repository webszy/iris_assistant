import { createRoute } from "@hono/zod-openapi";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { and, asc, eq, notExists, sql } from "drizzle-orm";

import { createDb, type Database } from "../db";
import { capabilities, resources, type ResourceRow } from "../db/schema";
import { ERROR_CODES, errorResponse, errorResponseSchema, type ErrorCode } from "../lib/response";
import { nowEpochMs, toIso8601Utc } from "../lib/time";
import {
  createResourceRequestSchema,
  resourceItemResponseSchema,
  resourceListQuerySchema,
  resourceListResponseSchema,
  resourceParamsSchema,
  type ResourceKind,
  type ResourceRole,
  updateResourceRequestSchema,
} from "../schemas/resource";
import { findUserMilestone } from "./milestones";
import { findUserProject } from "./projects";
import { findUserTask } from "./tasks";
import type { AppEnv } from "../types/env";

const errorContent = { "application/json": { schema: errorResponseSchema } };

const RESPONSE_400 = { content: errorContent, description: "请求参数校验失败。" };
const RESPONSE_401 = { content: errorContent, description: "缺少或无效的访问令牌。" };
const RESPONSE_404 = {
  content: errorContent,
  description: "Project / Milestone / Task / Resource 不存在，或不属于当前用户与 URL Project。",
};

/**
 * Capability.type 与 Resource.kind 的对应关系。
 * script -> file，skill -> directory；Resource PATCH 会反向用同一规则校验。
 */
export function isCapabilityTypeCompatibleWithResourceKind(
  type: string,
  kind: string,
): boolean {
  if (type === "script") return kind === "file";
  if (type === "skill") return kind === "directory";
  return false;
}

export async function findUserResource(
  db: Database,
  userId: string,
  projectId: string,
  resourceId: string,
): Promise<ResourceRow | undefined> {
  const rows = await db
    .select()
    .from(resources)
    .where(
      and(
        eq(resources.id, resourceId),
        eq(resources.userId, userId),
        eq(resources.projectId, projectId),
      ),
    )
    .limit(1);
  return rows[0];
}

export function toResourceResponse(row: ResourceRow) {
  return {
    id: row.id,
    projectId: row.projectId,
    milestoneId: row.milestoneId,
    taskId: row.taskId,
    name: row.name,
    kind: row.kind as ResourceKind,
    role: row.role as ResourceRole,
    repository: row.repository,
    path: row.path,
    url: row.url,
    createdAt: toIso8601Utc(row.createdAt),
    updatedAt: toIso8601Utc(row.updatedAt),
  };
}

/** kind 与 location 字段的匹配规则。 */
function locationSatisfiesKind(
  kind: string,
  repository: string | null,
  path: string | null,
  url: string | null,
): boolean {
  if (kind === "repository") return repository !== null;
  if (kind === "directory" || kind === "file") return repository !== null && path !== null;
  if (kind === "url") return url !== null;
  return false;
}

interface ResourceScopeInput {
  milestoneId: string | null;
  taskId: string | null;
  kind: string;
  repository: string | null;
  path: string | null;
  url: string | null;
}

type ScopeFailure =
  | { status: 422; code: ErrorCode; message: string }
  | undefined;

/**
 * 结构校验顺序：先归属互斥，再 kind/location，最后引用完整性。
 * 返回 undefined 表示通过。
 */
function validateResourceShape(input: ResourceScopeInput): ScopeFailure {
  if (input.milestoneId !== null && input.taskId !== null) {
    return {
      status: 422,
      code: ERROR_CODES.INVALID_RESOURCE_SCOPE,
      message: "milestone_id 与 task_id 不能同时存在。",
    };
  }
  if (!locationSatisfiesKind(input.kind, input.repository, input.path, input.url)) {
    return {
      status: 422,
      code: ERROR_CODES.INVALID_RESOURCE_LOCATION,
      message: "该 kind 所需的 repository / path / url 不完整。",
    };
  }
  return undefined;
}

function mustFind(row: ResourceRow | undefined): ResourceRow {
  if (row === undefined) {
    throw new Error("resource row unexpectedly missing after write");
  }
  return row;
}

const listResourcesRoute = createRoute({
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

const createResourceRoute = createRoute({
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

const getResourceRoute = createRoute({
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

const updateResourceRoute = createRoute({
  method: "patch",
  path: "/api/v1/projects/{projectId}/resources/{resourceId}",
  tags: ["Resource"],
  summary: "更新 Resource metadata",
  description:
    "任何修改都会在合并后的完整记录上重新执行归属、location 与引用校验。若 kind 变更会破坏已有 Capability 关系，返回 422 且不写入。",
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

const deleteResourceRoute = createRoute({
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
  app.openapi(listResourcesRoute, async (c) => {
    const db = createDb(c.env.DB);
    const userId = c.get("user").id;
    const { projectId } = c.req.valid("param");
    const query = c.req.valid("query");

    const project = await findUserProject(db, userId, projectId);
    if (project === undefined) {
      return c.json(errorResponse(ERROR_CODES.PROJECT_NOT_FOUND, "Project 不存在。"), 404);
    }

    if (query.milestone_id !== undefined) {
      const milestone = await findUserMilestone(db, userId, projectId, query.milestone_id);
      if (milestone === undefined) {
        return c.json(errorResponse(ERROR_CODES.MILESTONE_NOT_FOUND, "Milestone 不存在。"), 404);
      }
    }
    if (query.task_id !== undefined) {
      const task = await findUserTask(db, userId, projectId, query.task_id);
      if (task === undefined) {
        return c.json(errorResponse(ERROR_CODES.TASK_NOT_FOUND, "Task 不存在。"), 404);
      }
    }

    const filters = [eq(resources.userId, userId), eq(resources.projectId, projectId)];
    if (query.kind !== undefined) filters.push(eq(resources.kind, query.kind));
    if (query.role !== undefined) filters.push(eq(resources.role, query.role));
    if (query.milestone_id !== undefined) filters.push(eq(resources.milestoneId, query.milestone_id));
    if (query.task_id !== undefined) filters.push(eq(resources.taskId, query.task_id));

    const rows = await db
      .select()
      .from(resources)
      .where(and(...filters))
      .orderBy(asc(resources.createdAt));

    return c.json({ success: true as const, data: rows.map(toResourceResponse) }, 200);
  });

  app.openapi(createResourceRoute, async (c) => {
    const db = createDb(c.env.DB);
    const userId = c.get("user").id;
    const { projectId } = c.req.valid("param");
    const body = c.req.valid("json");

    const project = await findUserProject(db, userId, projectId);
    if (project === undefined) {
      return c.json(errorResponse(ERROR_CODES.PROJECT_NOT_FOUND, "Project 不存在。"), 404);
    }

    const milestoneId = body.milestone_id ?? null;
    const taskId = body.task_id ?? null;
    const repository = body.repository ?? null;
    const path = body.path ?? null;
    const url = body.url ?? null;

    const shape = validateResourceShape({
      milestoneId,
      taskId,
      kind: body.kind,
      repository,
      path,
      url,
    });
    if (shape !== undefined) {
      return c.json(errorResponse(shape.code, shape.message), 422);
    }

    if (milestoneId !== null) {
      const milestone = await findUserMilestone(db, userId, projectId, milestoneId);
      if (milestone === undefined) {
        return c.json(errorResponse(ERROR_CODES.MILESTONE_NOT_FOUND, "Milestone 不存在。"), 404);
      }
    }
    if (taskId !== null) {
      const task = await findUserTask(db, userId, projectId, taskId);
      if (task === undefined) {
        return c.json(errorResponse(ERROR_CODES.TASK_NOT_FOUND, "Task 不存在。"), 404);
      }
    }

    const id = crypto.randomUUID();
    const now = nowEpochMs();

    await db.insert(resources).values({
      id,
      userId,
      projectId,
      milestoneId,
      taskId,
      name: body.name,
      kind: body.kind,
      role: body.role,
      repository,
      path,
      url,
      createdAt: now,
      updatedAt: now,
    });

    const created = mustFind(await findUserResource(db, userId, projectId, id));
    return c.json({ success: true as const, data: toResourceResponse(created) }, 201);
  });

  app.openapi(getResourceRoute, async (c) => {
    const db = createDb(c.env.DB);
    const { projectId, resourceId } = c.req.valid("param");

    const resource = await findUserResource(db, c.get("user").id, projectId, resourceId);
    if (resource === undefined) {
      return c.json(errorResponse(ERROR_CODES.RESOURCE_NOT_FOUND, "Resource 不存在。"), 404);
    }
    return c.json({ success: true as const, data: toResourceResponse(resource) }, 200);
  });

  app.openapi(updateResourceRoute, async (c) => {
    const db = createDb(c.env.DB);
    const userId = c.get("user").id;
    const { projectId, resourceId } = c.req.valid("param");
    const body = c.req.valid("json");
    const scope = and(
      eq(resources.id, resourceId),
      eq(resources.userId, userId),
      eq(resources.projectId, projectId),
    );

    if (await findUserResource(db, userId, projectId, resourceId) === undefined) {
      return c.json(errorResponse(ERROR_CODES.RESOURCE_NOT_FOUND, "Resource 不存在。"), 404);
    }

    // Project/Milestone/Task 不提供 hard delete 或跨 Project 移动；新传入的父键仍须校验。
    if (body.milestone_id !== undefined && body.milestone_id !== null) {
      if (await findUserMilestone(db, userId, projectId, body.milestone_id) === undefined) {
        return c.json(errorResponse(ERROR_CODES.MILESTONE_NOT_FOUND, "Milestone 不存在。"), 404);
      }
    }
    if (body.task_id !== undefined && body.task_id !== null) {
      if (await findUserTask(db, userId, projectId, body.task_id) === undefined) {
        return c.json(errorResponse(ERROR_CODES.TASK_NOT_FOUND, "Task 不存在。"), 404);
      }
    }

    // 未提交字段直接引用当前数据库列，不使用此前 SELECT 的旧值。
    const kind = body.kind === undefined ? sql`${resources.kind}` : sql`${body.kind}`;
    const milestoneId = body.milestone_id === undefined
      ? sql`${resources.milestoneId}` : sql`${body.milestone_id}`;
    const taskId = body.task_id === undefined ? sql`${resources.taskId}` : sql`${body.task_id}`;
    const repository = body.repository === undefined
      ? sql`${resources.repository}` : sql`${body.repository}`;
    const path = body.path === undefined ? sql`${resources.path}` : sql`${body.path}`;
    const url = body.url === undefined ? sql`${resources.url}` : sql`${body.url}`;
    const validShape = sql`
      (${milestoneId} is null or ${taskId} is null) and (
        (${kind} = 'repository' and ${repository} is not null) or
        (${kind} in ('file', 'directory') and ${repository} is not null and ${path} is not null) or
        (${kind} = 'url' and ${url} is not null)
      )
    `;
    const references = db.select({ id: capabilities.id, type: capabilities.type })
      .from(capabilities)
      .where(and(eq(capabilities.userId, userId), eq(capabilities.resourceId, resourceId)));
    const incompatibleReferences = db.select({ id: capabilities.id }).from(capabilities)
      .where(and(
        eq(capabilities.userId, userId),
        eq(capabilities.resourceId, resourceId),
        sql`not ((${capabilities.type} = 'script' and ${kind} = 'file')
          or (${capabilities.type} = 'skill' and ${kind} = 'directory'))`,
      ));

    // D1 batch 是同一事务：用于错误分类的快照与带条件 UPDATE 之间不能插入其他写入。
    const [before, referencing, written] = await db.batch([
      db.select().from(resources).where(scope).limit(1),
      references,
      db.update(resources).set({
        name: body.name,
        kind: body.kind,
        role: body.role,
        milestoneId: body.milestone_id,
        taskId: body.task_id,
        repository: body.repository,
        path: body.path,
        url: body.url,
        updatedAt: nowEpochMs(),
      }).where(and(scope, validShape, notExists(incompatibleReferences))).returning(),
    ]);

    const current = before[0];
    if (current === undefined) {
      return c.json(errorResponse(ERROR_CODES.RESOURCE_NOT_FOUND, "Resource 不存在。"), 404);
    }
    const merged = {
      kind: body.kind ?? current.kind,
      milestoneId: body.milestone_id === undefined ? current.milestoneId : body.milestone_id,
      taskId: body.task_id === undefined ? current.taskId : body.task_id,
      repository: body.repository === undefined ? current.repository : body.repository,
      path: body.path === undefined ? current.path : body.path,
      url: body.url === undefined ? current.url : body.url,
    };
    const shape = validateResourceShape(merged);
    if (shape !== undefined) {
      return c.json(errorResponse(shape.code, shape.message), 422);
    }
    if (referencing.some(row => !isCapabilityTypeCompatibleWithResourceKind(row.type, merged.kind))) {
      return c.json(errorResponse(
        ERROR_CODES.INVALID_CAPABILITY_RESOURCE_KIND,
        "该修改会破坏已有 Capability 与 Resource kind 的对应关系。",
      ), 422);
    }

    return c.json({ success: true as const, data: toResourceResponse(mustFind(written[0])) }, 200);
  });

  app.openapi(deleteResourceRoute, async (c) => {
    const db = createDb(c.env.DB);
    const userId = c.get("user").id;
    const { projectId, resourceId } = c.req.valid("param");
    const scope = and(
      eq(resources.id, resourceId),
      eq(resources.userId, userId),
      eq(resources.projectId, projectId),
    );
    const references = db.select({ id: capabilities.id }).from(capabilities)
      .where(and(eq(capabilities.userId, userId), eq(capabilities.resourceId, resourceId)));

    // 让引用判断与删除共享事务；disabled 仍算引用，FK RESTRICT 继续兜底。
    const [before, deleted] = await db.batch([
      db.select({ id: resources.id }).from(resources).where(scope).limit(1),
      db.delete(resources).where(and(scope, notExists(references))).returning({ id: resources.id }),
    ]);
    if (before.length === 0) {
      return c.json(errorResponse(ERROR_CODES.RESOURCE_NOT_FOUND, "Resource 不存在。"), 404);
    }
    if (deleted.length === 0) {
      return c.json(
        errorResponse(ERROR_CODES.RESOURCE_IN_USE, "该 Resource 仍被 Capability 引用，无法删除。"),
        409,
      );
    }
    return c.body(null, 204);
  });
}
