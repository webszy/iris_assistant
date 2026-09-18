import { describe, expect, it } from "vitest";

import {
  apiFetch,
  createMilestone,
  createProject,
  createTask,
  readJson,
  seedIdentity,
  type TaskPayload,
} from "./helpers";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

interface ErrorBody {
  success: boolean;
  error: { code: string; message: string };
}

interface TaskItemBody {
  success: boolean;
  data: TaskPayload;
}

interface TaskListBody {
  success: boolean;
  data: TaskPayload[];
}

describe("POST /api/v1/projects/:projectId/tasks", () => {
  it("创建 Project-level Task 返回 201 与默认值", async () => {
    const identity = await seedIdentity();
    const project = await createProject(identity.rawToken);

    const response = await apiFetch(`/api/v1/projects/${project.id}/tasks`, {
      method: "POST",
      token: identity.rawToken,
      body: { title: "Implement Project Core" },
    });

    expect(response.status).toBe(201);
    const body = await readJson<TaskItemBody>(response);
    expect(body.data.id).toMatch(UUID_V4);
    expect(body.data.projectId).toBe(project.id);
    expect(body.data.milestoneId).toBeNull();
    expect(body.data.status).toBe("todo");
    expect(body.data.position).toBe(100);
    expect(body.data.completedAt).toBeNull();
  });

  it("创建 Milestone Task 并记录 milestone_id", async () => {
    const identity = await seedIdentity();
    const project = await createProject(identity.rawToken);
    const milestone = await createMilestone(identity.rawToken, project.id);

    const created = await createTask(identity.rawToken, project.id, {
      milestone_id: milestone.id,
    });

    expect(created.milestoneId).toBe(milestone.id);
    expect(created.position).toBe(100);
  });

  it("position 按分组独立自动递增", async () => {
    const identity = await seedIdentity();
    const project = await createProject(identity.rawToken);
    const milestone = await createMilestone(identity.rawToken, project.id);

    const projectTaskA = await createTask(identity.rawToken, project.id);
    const projectTaskB = await createTask(identity.rawToken, project.id);
    const milestoneTaskA = await createTask(identity.rawToken, project.id, {
      milestone_id: milestone.id,
    });
    const milestoneTaskB = await createTask(identity.rawToken, project.id, {
      milestone_id: milestone.id,
    });

    expect([projectTaskA.position, projectTaskB.position]).toEqual([100, 200]);
    expect([milestoneTaskA.position, milestoneTaskB.position]).toEqual([100, 200]);
  });

  it("创建时 status = completed 会同时写入 completed_at", async () => {
    const identity = await seedIdentity();
    const project = await createProject(identity.rawToken);

    const created = await createTask(identity.rawToken, project.id, { status: "completed" });

    expect(created.status).toBe("completed");
    expect(created.completedAt).not.toBeNull();
    expect(Number.isNaN(Date.parse(created.completedAt ?? ""))).toBe(false);
  });

  it("非本 Project 的 Milestone 被拒绝并返回 404", async () => {
    const identity = await seedIdentity();
    const first = await createProject(identity.rawToken, { slug: "first" });
    const second = await createProject(identity.rawToken, { slug: "second" });
    const foreign = await createMilestone(identity.rawToken, second.id);

    const response = await apiFetch(`/api/v1/projects/${first.id}/tasks`, {
      method: "POST",
      token: identity.rawToken,
      body: { title: "跨 Project", milestone_id: foreign.id },
    });

    expect(response.status).toBe(404);
    expect((await readJson<ErrorBody>(response)).error.code).toBe("MILESTONE_NOT_FOUND");
  });

  it("跨用户 Milestone 被拒绝并返回 404", async () => {
    const owner = await seedIdentity();
    const stranger = await seedIdentity();
    const project = await createProject(owner.rawToken);
    const milestone = await createMilestone(owner.rawToken, project.id);

    const response = await apiFetch(`/api/v1/projects/${project.id}/tasks`, {
      method: "POST",
      token: stranger.rawToken,
      body: { title: "越权", milestone_id: milestone.id },
    });
    expect(response.status).toBe(404);
  });

  it("拒绝缺失 title、非法 status 与只读字段", async () => {
    const identity = await seedIdentity();
    const project = await createProject(identity.rawToken);

    const missingTitle = await apiFetch(`/api/v1/projects/${project.id}/tasks`, {
      method: "POST",
      token: identity.rawToken,
      body: { description: "无标题" },
    });
    expect(missingTitle.status).toBe(400);

    const badStatus = await apiFetch(`/api/v1/projects/${project.id}/tasks`, {
      method: "POST",
      token: identity.rawToken,
      body: { title: "x", status: "blocked" },
    });
    expect(badStatus.status).toBe(400);

    const withReadonly = await apiFetch(`/api/v1/projects/${project.id}/tasks`, {
      method: "POST",
      token: identity.rawToken,
      body: { title: "x", project_id: crypto.randomUUID() },
    });
    expect(withReadonly.status).toBe(400);
  });

  it("未认证请求被拒绝", async () => {
    const identity = await seedIdentity();
    const project = await createProject(identity.rawToken);

    const response = await apiFetch(`/api/v1/projects/${project.id}/tasks`, {
      method: "POST",
      body: { title: "x" },
    });
    expect(response.status).toBe(401);
  });
});

describe("GET /api/v1/projects/:projectId/tasks", () => {
  it("按 position 升序返回并支持 status / milestone_id 过滤", async () => {
    const identity = await seedIdentity();
    const project = await createProject(identity.rawToken);
    const milestone = await createMilestone(identity.rawToken, project.id);

    await createTask(identity.rawToken, project.id, { title: "第二", position: 200 });
    await createTask(identity.rawToken, project.id, { title: "第一", position: 100 });
    await createTask(identity.rawToken, project.id, {
      title: "里程碑内",
      milestone_id: milestone.id,
      position: 400,
    });
    await createTask(identity.rawToken, project.id, {
      title: "已完成",
      position: 300,
      status: "completed",
    });

    const all = await readJson<TaskListBody>(
      await apiFetch(`/api/v1/projects/${project.id}/tasks`, { token: identity.rawToken }),
    );
    expect(all.data.map((item) => item.title)).toEqual(["第一", "第二", "已完成", "里程碑内"]);

    const completed = await readJson<TaskListBody>(
      await apiFetch(`/api/v1/projects/${project.id}/tasks?status=completed`, {
        token: identity.rawToken,
      }),
    );
    expect(completed.data.map((item) => item.title)).toEqual(["已完成"]);

    const inMilestone = await readJson<TaskListBody>(
      await apiFetch(`/api/v1/projects/${project.id}/tasks?milestone_id=${milestone.id}`, {
        token: identity.rawToken,
      }),
    );
    expect(inMilestone.data.map((item) => item.title)).toEqual(["里程碑内"]);
  });

  it("milestone_id 过滤指向非本 Project 时返回 404", async () => {
    const identity = await seedIdentity();
    const first = await createProject(identity.rawToken, { slug: "first" });
    const second = await createProject(identity.rawToken, { slug: "second" });
    const foreign = await createMilestone(identity.rawToken, second.id);

    const response = await apiFetch(
      `/api/v1/projects/${first.id}/tasks?milestone_id=${foreign.id}`,
      { token: identity.rawToken },
    );
    expect(response.status).toBe(404);
  });
});

describe("PATCH /api/v1/projects/:projectId/tasks/:taskId", () => {
  it("todo -> completed 设置 completed_at", async () => {
    const identity = await seedIdentity();
    const project = await createProject(identity.rawToken);
    const task = await createTask(identity.rawToken, project.id);

    const response = await apiFetch(`/api/v1/projects/${project.id}/tasks/${task.id}`, {
      method: "PATCH",
      token: identity.rawToken,
      body: { status: "completed" },
    });

    expect(response.status).toBe(200);
    const body = await readJson<TaskItemBody>(response);
    expect(body.data.status).toBe("completed");
    expect(body.data.completedAt).not.toBeNull();
  });

  it("completed -> doing 清空 completed_at", async () => {
    const identity = await seedIdentity();
    const project = await createProject(identity.rawToken);
    const task = await createTask(identity.rawToken, project.id, { status: "completed" });
    expect(task.completedAt).not.toBeNull();

    const response = await apiFetch(`/api/v1/projects/${project.id}/tasks/${task.id}`, {
      method: "PATCH",
      token: identity.rawToken,
      body: { status: "doing" },
    });

    const body = await readJson<TaskItemBody>(response);
    expect(body.data.status).toBe("doing");
    expect(body.data.completedAt).toBeNull();
  });

  it("completed -> completed 保留原 completed_at", async () => {
    const identity = await seedIdentity();
    const project = await createProject(identity.rawToken);
    const task = await createTask(identity.rawToken, project.id, { status: "completed" });

    const response = await apiFetch(`/api/v1/projects/${project.id}/tasks/${task.id}`, {
      method: "PATCH",
      token: identity.rawToken,
      body: { status: "completed" },
    });

    expect((await readJson<TaskItemBody>(response)).data.completedAt).toBe(task.completedAt);
  });

  it("修改已 completed Task 的 title 不改变 completed_at", async () => {
    const identity = await seedIdentity();
    const project = await createProject(identity.rawToken);
    const task = await createTask(identity.rawToken, project.id, {
      title: "原名",
      status: "completed",
    });

    const response = await apiFetch(`/api/v1/projects/${project.id}/tasks/${task.id}`, {
      method: "PATCH",
      token: identity.rawToken,
      body: { title: "改名" },
    });

    const body = await readJson<TaskItemBody>(response);
    expect(body.data.title).toBe("改名");
    expect(body.data.completedAt).toBe(task.completedAt);
  });

  it("可把 Task 挂到 Milestone，也可显式置回 Project 级", async () => {
    const identity = await seedIdentity();
    const project = await createProject(identity.rawToken);
    const milestone = await createMilestone(identity.rawToken, project.id);
    const task = await createTask(identity.rawToken, project.id);

    const attached = await readJson<TaskItemBody>(
      await apiFetch(`/api/v1/projects/${project.id}/tasks/${task.id}`, {
        method: "PATCH",
        token: identity.rawToken,
        body: { milestone_id: milestone.id },
      }),
    );
    expect(attached.data.milestoneId).toBe(milestone.id);

    const detached = await readJson<TaskItemBody>(
      await apiFetch(`/api/v1/projects/${project.id}/tasks/${task.id}`, {
        method: "PATCH",
        token: identity.rawToken,
        body: { milestone_id: null },
      }),
    );
    expect(detached.data.milestoneId).toBeNull();
  });

  it("改到非本 Project 的 Milestone 被拒绝", async () => {
    const identity = await seedIdentity();
    const first = await createProject(identity.rawToken, { slug: "first" });
    const second = await createProject(identity.rawToken, { slug: "second" });
    const foreign = await createMilestone(identity.rawToken, second.id);
    const task = await createTask(identity.rawToken, first.id);

    const response = await apiFetch(`/api/v1/projects/${first.id}/tasks/${task.id}`, {
      method: "PATCH",
      token: identity.rawToken,
      body: { milestone_id: foreign.id },
    });
    expect(response.status).toBe(404);
  });

  it("跨用户访问返回 404", async () => {
    const owner = await seedIdentity();
    const stranger = await seedIdentity();
    const project = await createProject(owner.rawToken);
    const task = await createTask(owner.rawToken, project.id, { title: "原名" });

    const patch = await apiFetch(`/api/v1/projects/${project.id}/tasks/${task.id}`, {
      method: "PATCH",
      token: stranger.rawToken,
      body: { title: "被篡改" },
    });
    expect(patch.status).toBe(404);

    const get = await apiFetch(`/api/v1/projects/${project.id}/tasks/${task.id}`, {
      token: stranger.rawToken,
    });
    expect(get.status).toBe(404);
  });

  it("同用户跨 Project 读取返回 404", async () => {
    const identity = await seedIdentity();
    const first = await createProject(identity.rawToken, { slug: "first" });
    const second = await createProject(identity.rawToken, { slug: "second" });
    const task = await createTask(identity.rawToken, first.id);

    const response = await apiFetch(`/api/v1/projects/${second.id}/tasks/${task.id}`, {
      token: identity.rawToken,
    });
    expect(response.status).toBe(404);
  });
});

describe("Task 不提供 hard delete", () => {
  it("DELETE 路由不存在，改用 status = cancelled", async () => {
    const identity = await seedIdentity();
    const project = await createProject(identity.rawToken);
    const task = await createTask(identity.rawToken, project.id);

    const deleted = await apiFetch(`/api/v1/projects/${project.id}/tasks/${task.id}`, {
      method: "DELETE",
      token: identity.rawToken,
    });
    expect(deleted.status).toBe(404);

    const cancelled = await apiFetch(`/api/v1/projects/${project.id}/tasks/${task.id}`, {
      method: "PATCH",
      token: identity.rawToken,
      body: { status: "cancelled" },
    });
    expect(cancelled.status).toBe(200);
    expect((await readJson<TaskItemBody>(cancelled)).data.status).toBe("cancelled");
  });
});
