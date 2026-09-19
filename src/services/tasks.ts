import type { z } from "zod";
import type { createTaskRequestSchema, updateTaskRequestSchema, taskListQuerySchema } from "../schemas/task";
import { ServiceError } from "../lib/service-error";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { SQLiteUpdateSetSource } from "drizzle-orm/sqlite-core";
import type { Database } from "../db";
import { tasks, type TaskRow } from "../db/schema";
import { ERROR_CODES } from "../lib/error-codes";
import { nowEpochMs, toIso8601Utc } from "../lib/time";
import type { TaskStatus } from "../schemas/task";
import { findUserMilestone } from "./milestones";
import { findUserProject } from "./projects";

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

export async function listTasks(db: Database, userId: string, projectId: string, query: z.infer<typeof taskListQuerySchema>) {

  const project = await findUserProject(db, userId, projectId);
  if (project === undefined) {
    throw new ServiceError(ERROR_CODES.PROJECT_NOT_FOUND, "Project 不存在。");
  }

  if (query.milestone_id !== undefined) {
    const milestone = await findUserMilestone(db, userId, projectId, query.milestone_id);
    if (milestone === undefined) {
      throw new ServiceError(ERROR_CODES.MILESTONE_NOT_FOUND, "Milestone 不存在。");
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

  return rows.map(toTaskResponse);
}

export async function createTask(db: Database, userId: string, projectId: string, body: z.infer<typeof createTaskRequestSchema>) {

  const project = await findUserProject(db, userId, projectId);
  if (project === undefined) {
    throw new ServiceError(ERROR_CODES.PROJECT_NOT_FOUND, "Project 不存在。");
  }

  const milestoneId = body.milestone_id ?? null;
  if (milestoneId !== null) {
    const milestone = await findUserMilestone(db, userId, projectId, milestoneId);
    if (milestone === undefined) {
      throw new ServiceError(ERROR_CODES.MILESTONE_NOT_FOUND, "Milestone 不存在。");
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
  return toTaskResponse(created);
}

export async function getTask(db: Database, userId: string, projectId: string, taskId: string) {

  const task = await findUserTask(db, userId, projectId, taskId);
  if (task === undefined) {
    throw new ServiceError(ERROR_CODES.TASK_NOT_FOUND, "Task 不存在。");
  }
  return toTaskResponse(task);
}

export async function updateTask(db: Database, userId: string, projectId: string, taskId: string, body: z.infer<typeof updateTaskRequestSchema>) {

  const task = await findUserTask(db, userId, projectId, taskId);
  if (task === undefined) {
    throw new ServiceError(ERROR_CODES.TASK_NOT_FOUND, "Task 不存在。");
  }

  if (body.milestone_id !== undefined && body.milestone_id !== null) {
    const milestone = await findUserMilestone(db, userId, projectId, body.milestone_id);
    if (milestone === undefined) {
      throw new ServiceError(ERROR_CODES.MILESTONE_NOT_FOUND, "Milestone 不存在。");
    }
  }

  const now = nowEpochMs();
  const patch: SQLiteUpdateSetSource<typeof tasks> = { updatedAt: now };
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
  return toTaskResponse(updated);
}
