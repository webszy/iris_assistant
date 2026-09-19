import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { createDb } from "../src/db";
import { ServiceError } from "../src/lib/service-error";
import * as projects from "../src/services/projects";
import * as milestones from "../src/services/milestones";
import * as tasks from "../src/services/tasks";
import * as resources from "../src/services/resources";
import * as capabilities from "../src/services/capabilities";
import { seedIdentity } from "./helpers";

describe("Service 可由非 HTTP 入口直接调用", () => {
  it("普通参数完成项目、阶段和任务生命周期，并保留用户隔离", async () => {
    const db = createDb(env.DB);
    const { userId } = await seedIdentity();
    const other = await seedIdentity();
    const project = await projects.createProject(db, userId, { name: "Scheduled work", slug: "scheduled-work" });
    const milestone = await milestones.createMilestone(db, userId, project.id, { name: "v1" });
    const task = await tasks.createTask(db, userId, project.id, { title: "Run job", milestone_id: milestone.id });
    const completed = await tasks.updateTask(db, userId, project.id, task.id, { status: "completed" });
    expect(completed.completedAt).not.toBeNull();
    const renamed = await tasks.updateTask(db, userId, project.id, task.id, { title: "Finished job" });
    expect(renamed.completedAt).toBe(completed.completedAt);
    const reopened = await tasks.updateTask(db, userId, project.id, task.id, { status: "doing" });
    expect(reopened.completedAt).toBeNull();
    await expect(tasks.getTask(db, other.userId, project.id, task.id)).rejects.toMatchObject({
      name: "ServiceError", code: "TASK_NOT_FOUND",
    });
    await expect(projects.createProject(db, userId, { name: "Duplicate", slug: project.slug }))
      .rejects.toBeInstanceOf(ServiceError);
    expect(await projects.listProjects(db, userId, {})).toHaveLength(1);
  });

  it("直接调用仍保护 Capability 引用和 Resource 原子更新", async () => {
    const db = createDb(env.DB);
    const { userId } = await seedIdentity();
    const project = await projects.createProject(db, userId, { name: "Runtime", slug: "runtime" });
    const resource = await resources.createResource(db, userId, project.id, {
      name: "Script", kind: "file", role: "artifact", repository: "memory", path: "job.ts",
    });
    const capability = await capabilities.createCapability(db, userId, project.id, {
      name: "Job", type: "script", resource_id: resource.id,
    });
    await capabilities.disableCapability(db, userId, project.id, capability.id);
    await expect(resources.deleteResource(db, userId, project.id, resource.id))
      .rejects.toMatchObject({ code: "RESOURCE_IN_USE" });
    await expect(resources.updateResource(db, userId, project.id, resource.id, { kind: "directory", name: "Invalid" }))
      .rejects.toMatchObject({ code: "INVALID_CAPABILITY_RESOURCE_KIND" });
    expect(await resources.getResource(db, userId, project.id, resource.id))
      .toMatchObject({ name: "Script", kind: "file" });
    const replacement = await resources.createResource(db, userId, project.id, {
      name: "Replacement", kind: "file", role: "artifact", repository: "memory", path: "new.ts",
    });
    await capabilities.updateCapability(db, userId, project.id, capability.id, { resource_id: replacement.id });
    await resources.deleteResource(db, userId, project.id, resource.id);
    await expect(resources.getResource(db, userId, project.id, resource.id))
      .rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
  });
});
