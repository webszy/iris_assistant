import type { z } from "zod";
import type { createMilestoneRequestSchema, updateMilestoneRequestSchema, milestoneListQuerySchema } from "../schemas/milestone";
import { ServiceError } from "../lib/service-error";
import { and, asc, eq, sql } from "drizzle-orm";

import { type Database } from "../db";
import { milestones, type MilestoneRow } from "../db/schema";
import { ERROR_CODES } from "../lib/error-codes";
import { nowEpochMs, toIso8601Utc } from "../lib/time";
import type { MilestoneStatus } from "../schemas/milestone";
import { findUserProject } from "./projects";

/** Milestone 必须同时属于当前用户和 URL 中的 Project。 */
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

export async function listMilestones(db: Database, userId: string, projectId: string, query: z.infer<typeof milestoneListQuerySchema>) {

  const project = await findUserProject(db, userId, projectId);
  if (project === undefined) {
    throw new ServiceError(ERROR_CODES.PROJECT_NOT_FOUND, "Project 不存在。");
  }

  const filters = [eq(milestones.userId, userId), eq(milestones.projectId, projectId)];
  if (query.status !== undefined) filters.push(eq(milestones.status, query.status));

  const rows = await db
    .select()
    .from(milestones)
    .where(and(...filters))
    .orderBy(asc(milestones.position));

  return rows.map(toMilestoneResponse);
}

export async function createMilestone(db: Database, userId: string, projectId: string, body: z.infer<typeof createMilestoneRequestSchema>) {

  const project = await findUserProject(db, userId, projectId);
  if (project === undefined) {
    throw new ServiceError(ERROR_CODES.PROJECT_NOT_FOUND, "Project 不存在。");
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
  return toMilestoneResponse(created);
}

export async function getMilestone(db: Database, userId: string, projectId: string, milestoneId: string) {

  const milestone = await findUserMilestone(db, userId, projectId, milestoneId);
  if (milestone === undefined) {
    throw new ServiceError(ERROR_CODES.MILESTONE_NOT_FOUND, "Milestone 不存在。");
  }
  return toMilestoneResponse(milestone);
}

export async function updateMilestone(db: Database, userId: string, projectId: string, milestoneId: string, body: z.infer<typeof updateMilestoneRequestSchema>) {

  const milestone = await findUserMilestone(db, userId, projectId, milestoneId);
  if (milestone === undefined) {
    throw new ServiceError(ERROR_CODES.MILESTONE_NOT_FOUND, "Milestone 不存在。");
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
  return toMilestoneResponse(updated);
}
