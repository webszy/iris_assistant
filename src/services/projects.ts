import type { z } from "zod";
import type { createProjectRequestSchema, updateProjectRequestSchema, projectListQuerySchema } from "../schemas/project";
import { ServiceError } from "../lib/service-error";
import { and, desc, eq, isNull } from "drizzle-orm";

import { type Database } from "../db";
import { projects, type ProjectRow } from "../db/schema";
import { ERROR_CODES } from "../lib/error-codes";
import { nowEpochMs, toIso8601Utc } from "../lib/time";
import type { ProjectKind, ProjectStatus } from "../schemas/project";

/**
 * 只按 (id, user_id) 查询：不属于当前用户的 Project 与不存在的 Project 返回同一结果，
 * 不泄漏另一个用户是否拥有该 Project。其他 service 复用此函数做 URL Project 归属校验。
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

export async function listProjects(db: Database, userId: string, query: z.infer<typeof projectListQuerySchema>) {

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

  return rows.map(toProjectResponse);
}

export async function createProject(db: Database, userId: string, body: z.infer<typeof createProjectRequestSchema>) {

  if (await slugTaken(db, userId, body.slug)) {
    throw new ServiceError(ERROR_CODES.SLUG_ALREADY_EXISTS, "该 slug 已被当前用户的其他 Project 使用。");
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
    throw new ServiceError(ERROR_CODES.SLUG_ALREADY_EXISTS, "该 slug 已被当前用户的其他 Project 使用。");
  }

  const created = mustFind(await findUserProject(db, userId, id));
  return toProjectResponse(created);
}

export async function getProject(db: Database, userId: string, projectId: string) {

  const project = await findUserProject(db, userId, projectId);
  if (project === undefined) {
    throw new ServiceError(ERROR_CODES.PROJECT_NOT_FOUND, "Project 不存在。");
  }
  return toProjectResponse(project);
}

export async function updateProject(db: Database, userId: string, projectId: string, body: z.infer<typeof updateProjectRequestSchema>) {

  const project = await findUserProject(db, userId, projectId);
  if (project === undefined) {
    throw new ServiceError(ERROR_CODES.PROJECT_NOT_FOUND, "Project 不存在。");
  }

  if (body.slug !== undefined && body.slug !== project.slug) {
    if (await slugTaken(db, userId, body.slug)) {
      throw new ServiceError(ERROR_CODES.SLUG_ALREADY_EXISTS, "该 slug 已被当前用户的其他 Project 使用。");
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
    throw new ServiceError(ERROR_CODES.SLUG_ALREADY_EXISTS, "该 slug 已被当前用户的其他 Project 使用。");
  }

  const updated = mustFind(await findUserProject(db, userId, projectId));
  return toProjectResponse(updated);
}

export async function archiveProject(db: Database, userId: string, projectId: string) {

  const project = await findUserProject(db, userId, projectId);
  if (project === undefined) {
    throw new ServiceError(ERROR_CODES.PROJECT_NOT_FOUND, "Project 不存在。");
  }

  if (project.archivedAt !== null) {
    return toProjectResponse(project);
  }

  const now = nowEpochMs();
  await db
    .update(projects)
    .set({ archivedAt: now, updatedAt: now })
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));

  const archived = mustFind(await findUserProject(db, userId, projectId));
  return toProjectResponse(archived);
}

export async function unarchiveProject(db: Database, userId: string, projectId: string) {

  const project = await findUserProject(db, userId, projectId);
  if (project === undefined) {
    throw new ServiceError(ERROR_CODES.PROJECT_NOT_FOUND, "Project 不存在。");
  }

  if (project.archivedAt === null) {
    return toProjectResponse(project);
  }

  const now = nowEpochMs();
  await db
    .update(projects)
    .set({ archivedAt: null, updatedAt: now })
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));

  const restored = mustFind(await findUserProject(db, userId, projectId));
  return toProjectResponse(restored);
}
