import type { z } from "zod";
import type { createCapabilityRequestSchema, updateCapabilityRequestSchema, capabilityListQuerySchema } from "../schemas/capability";
import { ServiceError } from "../lib/service-error";
import { and, asc, eq, exists, sql } from "drizzle-orm";

import { type Database } from "../db";
import { capabilities, resources, type CapabilityRow } from "../db/schema";
import { ERROR_CODES } from "../lib/error-codes";
import { nowEpochMs, toIso8601Utc } from "../lib/time";
import type { CapabilityType } from "../schemas/capability";
import { findUserProject } from "./projects";
import { isCapabilityTypeCompatibleWithResourceKind } from "./resources";

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

export async function listCapabilities(db: Database, userId: string, projectId: string, query: z.infer<typeof capabilityListQuerySchema>) {

  const project = await findUserProject(db, userId, projectId);
  if (project === undefined) {
    throw new ServiceError(ERROR_CODES.PROJECT_NOT_FOUND, "Project 不存在。");
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

  return rows.map(toCapabilityResponse);
}

export async function createCapability(db: Database, userId: string, projectId: string, body: z.infer<typeof createCapabilityRequestSchema>) {

  if (await findUserProject(db, userId, projectId) === undefined) {
    throw new ServiceError(ERROR_CODES.PROJECT_NOT_FOUND, "Project 不存在。");
  }
  const resourceScope = and(
    eq(resources.id, body.resource_id),
    eq(resources.userId, userId),
    eq(resources.projectId, projectId),
  );
  const id = crypto.randomUUID();
  const now = nowEpochMs();

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
    throw new ServiceError(ERROR_CODES.RESOURCE_NOT_FOUND, "Resource 不存在。");
  }
  if (!isCapabilityTypeCompatibleWithResourceKind(body.type, target[0].kind)) {
    throw new ServiceError(ERROR_CODES.INVALID_CAPABILITY_RESOURCE_KIND, "Capability type 与 Resource kind 不匹配。");
  }
  return toCapabilityResponse(mustFind(written[0]));
}

export async function getCapability(db: Database, userId: string, projectId: string, capabilityId: string) {

  const capability = await findUserCapability(db, userId, projectId, capabilityId);
  if (capability === undefined) {
    throw new ServiceError(ERROR_CODES.CAPABILITY_NOT_FOUND, "Capability 不存在。");
  }
  return toCapabilityResponse(capability);
}

export async function updateCapability(db: Database, userId: string, projectId: string, capabilityId: string, body: z.infer<typeof updateCapabilityRequestSchema>) {

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
    throw new ServiceError(ERROR_CODES.CAPABILITY_NOT_FOUND, "Capability 不存在。");
  }
  if (target[0] === undefined) {
    throw new ServiceError(ERROR_CODES.RESOURCE_NOT_FOUND, "Resource 不存在。");
  }
  if (!isCapabilityTypeCompatibleWithResourceKind(body.type ?? current.type, target[0].kind)) {
    throw new ServiceError(ERROR_CODES.INVALID_CAPABILITY_RESOURCE_KIND, "Capability type 与 Resource kind 不匹配。");
  }
  return toCapabilityResponse(mustFind(written[0]));
}

export async function enableCapability(db: Database, userId: string, projectId: string, capabilityId: string) {

  const capability = await findUserCapability(db, userId, projectId, capabilityId);
  if (capability === undefined) {
    throw new ServiceError(ERROR_CODES.CAPABILITY_NOT_FOUND, "Capability 不存在。");
  }
  if (capability.enabled) {
    return toCapabilityResponse(capability);
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
  return toCapabilityResponse(updated);
}

export async function disableCapability(db: Database, userId: string, projectId: string, capabilityId: string) {

  const capability = await findUserCapability(db, userId, projectId, capabilityId);
  if (capability === undefined) {
    throw new ServiceError(ERROR_CODES.CAPABILITY_NOT_FOUND, "Capability 不存在。");
  }
  if (!capability.enabled) {
    return toCapabilityResponse(capability);
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
  return toCapabilityResponse(updated);
}
