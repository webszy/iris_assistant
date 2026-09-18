import { createRoute } from "@hono/zod-openapi";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { SQLiteUpdateSetSource } from "drizzle-orm/sqlite-core";

import { createDb, type Database } from "../db";
import { tasks, type TaskRow } from "../db/schema";
import { ERROR_CODES, errorResponse, errorResponseSchema } from "../lib/response";
import { nowEpochMs, toIso8601Utc } from "../lib/time";
import {
  createTaskRequestSchema,
  taskItemResponseSchema,
  taskListQuerySchema,
  taskListResponseSchema,
  taskParamsSchema,
  type TaskStatus,
  updateTaskRequestSchema,
} from "../schemas/task";
import { findUserMilestone } from "./milestones";
import { findUserProject } from "./projects";
import type { AppEnv } from "../types/env";

const errorContent = { "application/json": { schema: errorResponseSchema } };

const RESPONSE_400 = { content: errorContent, description: "请求参数校验失败。" };
const RESPONSE_401 = { content: errorContent, description: "缺少或无效的访问令牌。" };
const RESPONSE_404 = {
  content: errorContent,
  description: "Project / Milestone / Task 不存在，或不属于当前用户与 URL Project。",
};

/** Task 必须同时属于当前用户和 URL 中的 Project。 */
export async function findUserTask(
  db: Database,
  userId: string,
  projectId: string,
  taskId: string,
): Promise<TaskRow | undefined> {
  const rows = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId), eq(tasks.projectId, projectId)))
    .limit(1);
  return rows[0];
}

export function toTaskResponse(row: TaskRow) {
  return {
    id: row.id,
    projectId: row.projectId,
    milestoneId: row.milestoneId,
    title: row.title,
    description: row.description,
    status: row.status as TaskStatus,
    position: row.position,
    createdAt: toIso8601Utc(row.createdAt),
    updatedAt: toIso8601Utc(row.updatedAt),
    completedAt: row.completedAt === null ? null : toIso8601Utc(row.completedAt),
  };
}

/**
 * 未提供 position 时：有 Milestone 则在该 Milestone 内取最大值 + 100，
 * 否则在该 Project 的 project-level Tasks 中取最大值 + 100；第一条为 100。
 */
async function nextTaskPosition(
  db: Database,
  userId: string,
  projectId: string,
  milestoneId: string | null,
): Promise<number> {
  const filters = [eq(tasks.userId, userId), eq(tasks.projectId, projectId)];
  filters.push(
    milestoneId === null ? isNull(tasks.milestoneId) : eq(tasks.milestoneId, milestoneId),
  );

  const rows = await db
    .select({ maxPosition: sql<number | null>`max(${tasks.position})` })
    .from(tasks)
    .where(and(...filters));

  const maxPosition = rows[0]?.maxPosition ?? null;
  return maxPosition === null ? 100 : maxPosition + 100;
}

function mustFind(row: TaskRow | undefined): TaskRow {
  if (row === undefined) {
    throw new Error("task row unexpectedly missing after write");
  }
  return row;
}

const listTasksRoute = createRoute({
  method: "get",
  path: "/api/v1/projects/{projectId}/tasks",
  tags: ["Task"],
  summary: "列出 Project 下的 Tasks",
  description: "默认按 position 升序。支持 status 与 milestone_id 过滤；milestone_id 必须属于该 Project。",
  security: [{ bearerAuth: [] }],
  request: { params: taskParamsSchema.pick({ projectId: true }), query: taskListQuerySchema },
  responses: {
    200: { content: { "application/json": { schema: taskListResponseSchema } }, description: "查询成功" },
    400: RESPONSE_400,
    401: RESPONSE_401,
    404: RESPONSE_404,
  },
});

const createTaskRoute = createRoute({
  method: "post",
  path: "/api/v1/projects/{projectId}/tasks",
  tags: ["Task"],
  summary: "创建 Task",
  description:
    "project_id 来自 URL；milestone_id 可空。创建时 status = completed 会同时写入 completed_at。",
  security: [{ bearerAuth: [] }],
  request: {
    params: taskParamsSchema.pick({ projectId: true }),
    body: { required: true, content: { "application/json": { schema: createTaskRequestSchema } } },
  },
  responses: {
    201: { content: { "application/json": { schema: taskItemResponseSchema } }, description: "创建成功" },
    400: RESPONSE_400,
    401: RESPONSE_401,
    404: RESPONSE_404,
  },
});

const getTaskRoute = createRoute({
  method: "get",
  path: "/api/v1/projects/{projectId}/tasks/{taskId}",
  tags: ["Task"],
  summary: "读取单个 Task",
  security: [{ bearerAuth: [] }],
  request: { params: taskParamsSchema },
  responses: {
    200: { content: { "application/json": { schema: taskItemResponseSchema } }, description: "查询成功" },
    400: RESPONSE_400,
    401: RESPONSE_401,
    404: RESPONSE_404,
  },
});

const updateTaskRoute = createRoute({
  method: "patch",
  path: "/api/v1/projects/{projectId}/tasks/{taskId}",
  tags: ["Task"],
  summary: "更新 Task",
  description:
    "非 completed → completed 写入 completed_at；completed → 非 completed 清空；completed → completed 保留原值。v0.1 不提供 Task 删除路由。",
  security: [{ bearerAuth: [] }],
  request: {
    params: taskParamsSchema,
    body: { required: true, content: { "application/json": { schema: updateTaskRequestSchema } } },
  },
  responses: {
    200: { content: { "application/json": { schema: taskItemResponseSchema } }, description: "更新成功" },
    400: RESPONSE_400,
    401: RESPONSE_401,
    404: RESPONSE_404,
  },
});

export function registerTaskRoutes(app: OpenAPIHono<AppEnv>): void {
  app.openapi(listTasksRoute, async (c) => {
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

    const filters = [eq(tasks.userId, userId), eq(tasks.projectId, projectId)];
    if (query.status !== undefined) filters.push(eq(tasks.status, query.status));
    if (query.milestone_id !== undefined) filters.push(eq(tasks.milestoneId, query.milestone_id));

    const rows = await db
      .select()
      .from(tasks)
      .where(and(...filters))
      .orderBy(asc(tasks.position));

    return c.json({ success: true as const, data: rows.map(toTaskResponse) }, 200);
  });

  app.openapi(createTaskRoute, async (c) => {
    const db = createDb(c.env.DB);
    const userId = c.get("user").id;
    const { projectId } = c.req.valid("param");
    const body = c.req.valid("json");

    const project = await findUserProject(db, userId, projectId);
    if (project === undefined) {
      return c.json(errorResponse(ERROR_CODES.PROJECT_NOT_FOUND, "Project 不存在。"), 404);
    }

    const milestoneId = body.milestone_id ?? null;
    if (milestoneId !== null) {
      const milestone = await findUserMilestone(db, userId, projectId, milestoneId);
      if (milestone === undefined) {
        return c.json(errorResponse(ERROR_CODES.MILESTONE_NOT_FOUND, "Milestone 不存在。"), 404);
      }
    }

    const id = crypto.randomUUID();
    const now = nowEpochMs();
    const status = body.status ?? "todo";
    const position = body.position ?? (await nextTaskPosition(db, userId, projectId, milestoneId));

    await db.insert(tasks).values({
      id,
      userId,
      projectId,
      milestoneId,
      title: body.title,
      description: body.description ?? null,
      status,
      position,
      createdAt: now,
      updatedAt: now,
      completedAt: status === "completed" ? now : null,
    });

    const created = mustFind(await findUserTask(db, userId, projectId, id));
    return c.json({ success: true as const, data: toTaskResponse(created) }, 201);
  });

  app.openapi(getTaskRoute, async (c) => {
    const db = createDb(c.env.DB);
    const { projectId, taskId } = c.req.valid("param");

    const task = await findUserTask(db, c.get("user").id, projectId, taskId);
    if (task === undefined) {
      return c.json(errorResponse(ERROR_CODES.TASK_NOT_FOUND, "Task 不存在。"), 404);
    }
    return c.json({ success: true as const, data: toTaskResponse(task) }, 200);
  });

  app.openapi(updateTaskRoute, async (c) => {
    const db = createDb(c.env.DB);
    const userId = c.get("user").id;
    const { projectId, taskId } = c.req.valid("param");
    const body = c.req.valid("json");

    const task = await findUserTask(db, userId, projectId, taskId);
    if (task === undefined) {
      return c.json(errorResponse(ERROR_CODES.TASK_NOT_FOUND, "Task 不存在。"), 404);
    }

    if (body.milestone_id !== undefined && body.milestone_id !== null) {
      const milestone = await findUserMilestone(db, userId, projectId, body.milestone_id);
      if (milestone === undefined) {
        return c.json(errorResponse(ERROR_CODES.MILESTONE_NOT_FOUND, "Milestone 不存在。"), 404);
      }
    }

    const now = nowEpochMs();
    const patch: SQLiteUpdateSetSource<typeof tasks> = { updatedAt: now };
    // 只在请求改变状态时写完成时间，并以 UPDATE 执行时的状态判断转换。
    // 否则并发的标题编辑会把刚完成的 Task 的 completed_at 清空。
    if (body.status !== undefined) {
      patch.completedAt = body.status === "completed"
        ? sql`case when ${tasks.status} = 'completed' then ${tasks.completedAt} else ${now} end`
        : null;
    }
    if (body.milestone_id !== undefined) patch.milestoneId = body.milestone_id;
    if (body.title !== undefined) patch.title = body.title;
    if (body.description !== undefined) patch.description = body.description;
    if (body.status !== undefined) patch.status = body.status;
    if (body.position !== undefined) patch.position = body.position;

    await db
      .update(tasks)
      .set(patch)
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId), eq(tasks.projectId, projectId)));

    const updated = mustFind(await findUserTask(db, userId, projectId, taskId));
    return c.json({ success: true as const, data: toTaskResponse(updated) }, 200);
  });
}
