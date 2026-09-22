import type { z } from "zod";
import type { Database } from "../db";
import { resources, type ResourceRow } from "../db/schema";
import { belongsToProject, contentSize, defaultCommitMessage, markdownPhysicalPath } from "../lib/markdown-content";
import { ServiceError } from "../lib/service-error";
import { nowEpochMs } from "../lib/time";
import { ContentProviderError, type ContentSnapshot } from "../providers/content-provider";
import { GitHubContentsProvider, memoryConfiguration } from "../providers/github-contents";
import type { createMarkdownRequestSchema, updateContentRequestSchema } from "../schemas/resource-content";
import type { Env } from "../types/env";
import { findUserProject } from "./projects";
import { findUserResource, toResourceResponse, validateResourceCreation } from "./resources";

function metadata(resource: ResourceRow, snapshot: ContentSnapshot) {
  return {
    resourceId: resource.id, repository: resource.repository!, path: resource.path!,
    contentType: "text/markdown" as const, revision: snapshot.revision, sizeBytes: snapshot.sizeBytes,
  };
}

function logFailure(event: string, projectId: string, resourceId: string, repository: string | null, path: string | null, error?: unknown) {
  // Only explicit safe fields, never errors/messages, bodies, headers or configuration.
  console.error(JSON.stringify({
    event, projectId, resourceId, repository, path,
    ...(error instanceof ContentProviderError ? {
      operation: error.operation, status: error.status, outcome: error.outcome, requestId: error.requestId,
    } : {}),
  }));
}

async function requireProject(db: Database, userId: string, projectId: string) {
  if (await findUserProject(db, userId, projectId) === undefined) {
    throw new ServiceError("PROJECT_NOT_FOUND", "Project 不存在。");
  }
}

async function contentResource(db: Database, env: Env, userId: string, projectId: string, resourceId: string) {
  await requireProject(db, userId, projectId);
  const resource = await findUserResource(db, userId, projectId, resourceId);
  if (!resource) throw new ServiceError("RESOURCE_NOT_FOUND", "Resource 不存在。");
  if (resource.kind !== "file" || !resource.path || !belongsToProject(resource.path, projectId)) {
    throw new ServiceError("RESOURCE_CONTENT_UNSUPPORTED", "Resource does not support Markdown content.");
  }
  try {
    const config = memoryConfiguration(env);
    if (resource.repository !== config.repository) {
      throw new ServiceError("RESOURCE_CONTENT_UNSUPPORTED", "Resource does not support Markdown content.");
    }
    return { resource, provider: new GitHubContentsProvider(config) };
  } catch (error) {
    if (error instanceof ContentProviderError) logFailure("content_provider_error", projectId, resourceId, resource.repository, resource.path, error);
    throw error;
  }
}

export async function createMarkdownResource(db: Database, env: Env, userId: string, projectId: string, body: z.infer<typeof createMarkdownRequestSchema>) {
  await requireProject(db, userId, projectId);
  const path = markdownPhysicalPath(projectId, body.path);
  contentSize(body.content);
  const id = crypto.randomUUID();
  let config: ReturnType<typeof memoryConfiguration>;
  try { config = memoryConfiguration(env); }
  catch (error) { logFailure("content_provider_error", projectId, id, null, path, error); throw error; }
  const fields = await validateResourceCreation(db, userId, projectId, {
    ...body, kind: "file", repository: config.repository, path,
  });
  const now = nowEpochMs();
  const row: ResourceRow = {
    id, userId, projectId, name: body.name, kind: "file", role: body.role,
    ...fields, createdAt: now, updatedAt: now,
  };
  const provider = new GitHubContentsProvider(config);
  let snapshot: ContentSnapshot;
  try {
    // Git existence is authoritative; existing metadata pointers need not be unique.
    snapshot = await provider.create({ path }, body.content, body.commit_message ?? defaultCommitMessage("Add", body.name));
  } catch (error) {
    if (error instanceof ContentProviderError) logFailure("content_create_failed", projectId, id, config.repository, path, error);
    throw error;
  }
  try {
    await db.insert(resources).values(row);
  } catch {
    let existing: ResourceRow | undefined;
    try { existing = await findUserResource(db, userId, projectId, id); }
    catch {
      logFailure("content_create_d1_outcome_unknown", projectId, id, config.repository, path);
      throw new Error("Resource creation outcome unknown");
    }
    if (existing) {
      // INSERT succeeded despite a lost result. No post-insert SELECT is needed on the normal path.
      logFailure("content_create_d1_write_recovered", projectId, id, config.repository, path);
      return { resource: toResourceResponse(existing), content: metadata(row, snapshot) };
    }
    try {
      await provider.delete({ path }, snapshot.revision, "Rollback failed Iris Resource creation");
      logFailure("content_create_rolled_back", projectId, id, config.repository, path);
    } catch (error) {
      logFailure("content_create_rollback_failed", projectId, id, config.repository, path, error);
    }
    throw new Error("Resource metadata creation failed");
  }
  return { resource: toResourceResponse(row), content: metadata(row, snapshot) };
}

export async function readResourceContent(db: Database, env: Env, userId: string, projectId: string, resourceId: string) {
  const { resource, provider } = await contentResource(db, env, userId, projectId, resourceId);
  try {
    const snapshot = await provider.read({ path: resource.path! });
    return { ...metadata(resource, snapshot), content: snapshot.content };
  } catch (error) {
    if (error instanceof ContentProviderError) logFailure("content_read_failed", projectId, resourceId, resource.repository, resource.path, error);
    throw error;
  }
}

export async function updateResourceContent(db: Database, env: Env, userId: string, projectId: string, resourceId: string, body: z.infer<typeof updateContentRequestSchema>) {
  const { resource, provider } = await contentResource(db, env, userId, projectId, resourceId);
  contentSize(body.content);
  try {
    const snapshot = await provider.update({ path: resource.path! }, body.content, body.expected_revision,
      body.commit_message ?? defaultCommitMessage("Update", resource.name));
    // Content writes deliberately do not touch D1, including Resource.updatedAt.
    return metadata(resource, snapshot);
  } catch (error) {
    if (error instanceof ContentProviderError) logFailure("content_update_failed", projectId, resourceId, resource.repository, resource.path, error);
    throw error;
  }
}
