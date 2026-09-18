import { createRoute } from "@hono/zod-openapi";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { and, asc, eq, sql } from "drizzle-orm";

import { createDb, type Database } from "../db";
import { milestones, type MilestoneRow } from "../db/schema";
import { ERROR_CODES, errorResponse, errorResponseSchema } from "../lib/response";
import { nowEpochMs, toIso8601Utc } from "../lib/time";
import {
  createMilestoneRequestSchema,
  milestoneItemResponseSchema,
  milestoneListQuerySchema,
  milestoneListResponseSchema,
  milestoneParamsSchema,
  type MilestoneStatus,
  updateMilestoneRequestSchema,
} from "../schemas/milestone";
import { findUserProject } from "./projects";
import type { AppEnv } from "../types/env";

const errorContent = { "application/json": { schema: errorResponseSchema } };

const RESPONSE_400 = { content: errorContent, description: "请求参数校验失败。" };
const RESPONSE_401 = { content: errorContent, description: "缺少或无效的访问令牌。" };
const RESPONSE_404 = {
  content: errorContent,
  description: "Project 或 Milestone 不存在，或不属于当前用户。",
};

/**
 * 只按 (id, user_id, project_id) 查询：Milestone 必须同时属于当前用户和 URL 中的 Project，
 * 否则与不存在返回同一结果。
 */
export async function findUserMilestone(
  db: Database,
  userId: string,
  projectId: string,
  milestoneId: string,
): Promise<MilestoneRow | undefined> {
  const rows = await db
    .select()
    .from(milestones)
    .where(
      and(
        eq(milestones.id, milestoneId),
        eq(milestones.userId, userId),
        eq(milestones.projectId, projectId),
      ),
    )
    .limit(1);
  return rows[0];
}

export function toMilestoneResponse(row: MilestoneRow) {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    description: row.description,
    status: row.status as MilestoneStatus,
    position: row.position,
    createdAt: toIso8601Utc(row.createdAt),
    updatedAt: toIso8601Utc(row.updatedAt),
  };
}

/** 未提供 position 时取该 Project 内最大 position + 100；第一条为 100。 */
async function nextMilestonePosition(
  db: Database,
  userId: string,
  projectId: string,
): Promise<number> {
  const rows = await db
    .select({ maxPosition: sql<number | null>`max(${milestones.position})` })
    .from(milestones)
    .where(and(eq(milestones.userId, userId), eq(milestones.projectId, projectId)));

  const maxPosition = rows[0]?.maxPosition ?? null;
  return maxPosition === null ? 100 : maxPosition + 100;
}

function mustFind(row: MilestoneRow | undefined): MilestoneRow {
  if (row === undefined) {
    throw new Error("milestone row unexpectedly missing after write");
  }
  return row;
}

const listMilestonesRoute = createRoute({
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

const createMilestoneRoute = createRoute({
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

const getMilestoneRoute = createRoute({
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

const updateMilestoneRoute = createRoute({
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
  app.openapi(listMilestonesRoute, async (c) => {
    const db = createDb(c.env.DB);
    const userId = c.get("user").id;
    const { projectId } = c.req.valid("param");
    const query = c.req.valid("query");

    const project = await findUserProject(db, userId, projectId);
    if (project === undefined) {
      return c.json(errorResponse(ERROR_CODES.PROJECT_NOT_FOUND, "Project 不存在。"), 404);
    }

    const filters = [eq(milestones.userId, userId), eq(milestones.projectId, projectId)];
    if (query.status !== undefined) filters.push(eq(milestones.status, query.status));

    const rows = await db
      .select()
      .from(milestones)
      .where(and(...filters))
      .orderBy(asc(milestones.position));

    return c.json({ success: true as const, data: rows.map(toMilestoneResponse) }, 200);
  });

  app.openapi(createMilestoneRoute, async (c) => {
    const db = createDb(c.env.DB);
    const userId = c.get("user").id;
    const { projectId } = c.req.valid("param");
    const body = c.req.valid("json");

    const project = await findUserProject(db, userId, projectId);
    if (project === undefined) {
      return c.json(errorResponse(ERROR_CODES.PROJECT_NOT_FOUND, "Project 不存在。"), 404);
    }

    const id = crypto.randomUUID();
    const now = nowEpochMs();
    const position = body.position ?? (await nextMilestonePosition(db, userId, projectId));

    await db.insert(milestones).values({
      id,
      userId,
      projectId,
      name: body.name,
      description: body.description ?? null,
      status: body.status ?? "planned",
      position,
      createdAt: now,
      updatedAt: now,
    });

    const created = mustFind(await findUserMilestone(db, userId, projectId, id));
    return c.json({ success: true as const, data: toMilestoneResponse(created) }, 201);
  });

  app.openapi(getMilestoneRoute, async (c) => {
    const db = createDb(c.env.DB);
    const { projectId, milestoneId } = c.req.valid("param");

    const milestone = await findUserMilestone(db, c.get("user").id, projectId, milestoneId);
    if (milestone === undefined) {
      return c.json(errorResponse(ERROR_CODES.MILESTONE_NOT_FOUND, "Milestone 不存在。"), 404);
    }
    return c.json({ success: true as const, data: toMilestoneResponse(milestone) }, 200);
  });

  app.openapi(updateMilestoneRoute, async (c) => {
    const db = createDb(c.env.DB);
    const userId = c.get("user").id;
    const { projectId, milestoneId } = c.req.valid("param");
    const body = c.req.valid("json");

    const milestone = await findUserMilestone(db, userId, projectId, milestoneId);
    if (milestone === undefined) {
      return c.json(errorResponse(ERROR_CODES.MILESTONE_NOT_FOUND, "Milestone 不存在。"), 404);
    }

    const patch: Partial<typeof milestones.$inferInsert> = { updatedAt: nowEpochMs() };
    if (body.name !== undefined) patch.name = body.name;
    if (body.description !== undefined) patch.description = body.description;
    if (body.status !== undefined) patch.status = body.status;
    if (body.position !== undefined) patch.position = body.position;

    await db
      .update(milestones)
      .set(patch)
      .where(
        and(
          eq(milestones.id, milestoneId),
          eq(milestones.userId, userId),
          eq(milestones.projectId, projectId),
        ),
      );

    const updated = mustFind(await findUserMilestone(db, userId, projectId, milestoneId));
    return c.json({ success: true as const, data: toMilestoneResponse(updated) }, 200);
  });
}
