import type { z } from "zod";
import type { createResourceRequestSchema, updateResourceRequestSchema, resourceListQuerySchema } from "../schemas/resource";
import { ServiceError } from "../lib/service-error";
import { and, asc, eq, notExists, sql } from "drizzle-orm";

import { type Database } from "../db";
import { capabilities, resources, type ResourceRow } from "../db/schema";
import { ERROR_CODES } from "../lib/error-codes";
import { nowEpochMs, toIso8601Utc } from "../lib/time";
import type { ResourceKind, ResourceRole } from "../schemas/resource";
import { findUserMilestone } from "./milestones";
import { findUserProject } from "./projects";
import { findUserTask } from "./tasks";

/** Capability.type 与 Resource.kind 的对应关系。 */
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
  | { code: "INVALID_RESOURCE_SCOPE" | "INVALID_RESOURCE_LOCATION"; message: string }
  | undefined;

function validateResourceShape(input: ResourceScopeInput): ScopeFailure {
  if (input.milestoneId !== null && input.taskId !== null) {
    return {
      code: ERROR_CODES.INVALID_RESOURCE_SCOPE,
      message: "milestone_id 与 task_id 不能同时存在。",
    };
  }
  if (!locationSatisfiesKind(input.kind, input.repository, input.path, input.url)) {
    return {
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

export async function listResources(db: Database, userId: string, projectId: string, query: z.infer<typeof resourceListQuerySchema>) {

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
  if (query.task_id !== undefined) {
    const task = await findUserTask(db, userId, projectId, query.task_id);
    if (task === undefined) {
      throw new ServiceError(ERROR_CODES.TASK_NOT_FOUND, "Task 不存在。");
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

  return rows.map(toResourceResponse);
}

export async function createResource(db: Database, userId: string, projectId: string, body: z.infer<typeof createResourceRequestSchema>) {

  const project = await findUserProject(db, userId, projectId);
  if (project === undefined) {
    throw new ServiceError(ERROR_CODES.PROJECT_NOT_FOUND, "Project 不存在。");
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
    throw new ServiceError(shape.code, shape.message);
  }

  if (milestoneId !== null) {
    const milestone = await findUserMilestone(db, userId, projectId, milestoneId);
    if (milestone === undefined) {
      throw new ServiceError(ERROR_CODES.MILESTONE_NOT_FOUND, "Milestone 不存在。");
    }
  }
  if (taskId !== null) {
    const task = await findUserTask(db, userId, projectId, taskId);
    if (task === undefined) {
      throw new ServiceError(ERROR_CODES.TASK_NOT_FOUND, "Task 不存在。");
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
  return toResourceResponse(created);
}

export async function getResource(db: Database, userId: string, projectId: string, resourceId: string) {

  const resource = await findUserResource(db, userId, projectId, resourceId);
  if (resource === undefined) {
    throw new ServiceError(ERROR_CODES.RESOURCE_NOT_FOUND, "Resource 不存在。");
  }
  return toResourceResponse(resource);
}

export async function updateResource(db: Database, userId: string, projectId: string, resourceId: string, body: z.infer<typeof updateResourceRequestSchema>) {

  const scope = and(
    eq(resources.id, resourceId),
    eq(resources.userId, userId),
    eq(resources.projectId, projectId),
  );

  if (await findUserResource(db, userId, projectId, resourceId) === undefined) {
    throw new ServiceError(ERROR_CODES.RESOURCE_NOT_FOUND, "Resource 不存在。");
  }

  if (body.milestone_id !== undefined && body.milestone_id !== null) {
    if (await findUserMilestone(db, userId, projectId, body.milestone_id) === undefined) {
      throw new ServiceError(ERROR_CODES.MILESTONE_NOT_FOUND, "Milestone 不存在。");
    }
  }
  if (body.task_id !== undefined && body.task_id !== null) {
    if (await findUserTask(db, userId, projectId, body.task_id) === undefined) {
      throw new ServiceError(ERROR_CODES.TASK_NOT_FOUND, "Task 不存在。");
    }
  }

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
    throw new ServiceError(ERROR_CODES.RESOURCE_NOT_FOUND, "Resource 不存在。");
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
    throw new ServiceError(shape.code, shape.message);
  }
  if (referencing.some(row => !isCapabilityTypeCompatibleWithResourceKind(row.type, merged.kind))) {
    throw new ServiceError(ERROR_CODES.INVALID_CAPABILITY_RESOURCE_KIND, "该修改会破坏已有 Capability 与 Resource kind 的对应关系。");
  }

  return toResourceResponse(mustFind(written[0]));
}

export async function deleteResource(db: Database, userId: string, projectId: string, resourceId: string) {

  const scope = and(
    eq(resources.id, resourceId),
    eq(resources.userId, userId),
    eq(resources.projectId, projectId),
  );
  const references = db.select({ id: capabilities.id }).from(capabilities)
    .where(and(eq(capabilities.userId, userId), eq(capabilities.resourceId, resourceId)));

  const [before, deleted] = await db.batch([
    db.select({ id: resources.id }).from(resources).where(scope).limit(1),
    db.delete(resources).where(and(scope, notExists(references))).returning({ id: resources.id }),
  ]);
  if (before.length === 0) {
    throw new ServiceError(ERROR_CODES.RESOURCE_NOT_FOUND, "Resource 不存在。");
  }
  if (deleted.length === 0) {
    throw new ServiceError(ERROR_CODES.RESOURCE_IN_USE, "该 Resource 仍被 Capability 引用，无法删除。");
  }
  return;
}
