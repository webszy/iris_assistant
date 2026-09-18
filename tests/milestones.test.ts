import { describe, expect, it } from "vitest";

import {
  apiFetch,
  createMilestone,
  createProject,
  readJson,
  seedIdentity,
  type MilestonePayload,
} from "./helpers";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

interface ErrorBody {
  success: boolean;
  error: { code: string; message: string };
}

interface MilestoneItemBody {
  success: boolean;
  data: MilestonePayload;
}

interface MilestoneListBody {
  success: boolean;
  data: MilestonePayload[];
}

describe("POST /api/v1/projects/:projectId/milestones", () => {
  it("创建成功返回 201、默认 status 与自动 position 100", async () => {
    const identity = await seedIdentity();
    const project = await createProject(identity.rawToken);

    const response = await apiFetch(`/api/v1/projects/${project.id}/milestones`, {
      method: "POST",
      token: identity.rawToken,
      body: { name: "v0.1" },
    });

    expect(response.status).toBe(201);
    const body = await readJson<MilestoneItemBody>(response);
    expect(body.data.id).toMatch(UUID_V4);
    expect(body.data.projectId).toBe(project.id);
    expect(body.data.status).toBe("planned");
    expect(body.data.position).toBe(100);
    expect(body.data.description).toBeNull();
    expect(Number.isNaN(Date.parse(body.data.createdAt))).toBe(false);
  });

  it("未提供 position 时按 Project 内最大值 + 100 递增", async () => {
    const identity = await seedIdentity();
    const project = await createProject(identity.rawToken);

    const first = await createMilestone(identity.rawToken, project.id);
    const second = await createMilestone(identity.rawToken, project.id);
    const third = await createMilestone(identity.rawToken, project.id);

    expect([first.position, second.position, third.position]).toEqual([100, 200, 300]);
  });

  it("显式提供的 position 被原样采用，且不影响后续自动递增的基数", async () => {
    const identity = await seedIdentity();
    const project = await createProject(identity.rawToken);

    const explicit = await createMilestone(identity.rawToken, project.id, { position: 500 });
    const auto = await createMilestone(identity.rawToken, project.id);

    expect(explicit.position).toBe(500);
    expect(auto.position).toBe(600);
  });

  it("不同 Project 的 position 各自独立", async () => {
    const identity = await seedIdentity();
    const first = await createProject(identity.rawToken, { slug: "p-one" });
    const second = await createProject(identity.rawToken, { slug: "p-two" });

    await createMilestone(identity.rawToken, first.id);
    await createMilestone(identity.rawToken, first.id);
    const otherFirst = await createMilestone(identity.rawToken, second.id);

    expect(otherFirst.position).toBe(100);
  });

  it("允许同一 Project 同时存在多个 active Milestone", async () => {
    const identity = await seedIdentity();
    const project = await createProject(identity.rawToken);

    const a = await createMilestone(identity.rawToken, project.id, { status: "active" });
    const b = await createMilestone(identity.rawToken, project.id, { status: "active" });

    expect(a.status).toBe("active");
    expect(b.status).toBe("active");

    const list = await readJson<MilestoneListBody>(
      await apiFetch(`/api/v1/projects/${project.id}/milestones?status=active`, {
        token: identity.rawToken,
      }),
    );
    expect(list.data).toHaveLength(2);
  });

  it("拒绝非整数 position 与只读字段", async () => {
    const identity = await seedIdentity();
    const project = await createProject(identity.rawToken);

    const badPosition = await apiFetch(`/api/v1/projects/${project.id}/milestones`, {
      method: "POST",
      token: identity.rawToken,
      body: { name: "v0.1", position: 1.5 },
    });
    expect(badPosition.status).toBe(400);

    const withReadonly = await apiFetch(`/api/v1/projects/${project.id}/milestones`, {
      method: "POST",
      token: identity.rawToken,
      body: { name: "v0.1", project_id: crypto.randomUUID() },
    });
    expect(withReadonly.status).toBe(400);
  });

  it("v0.1 不接受 deadline / completed_at 等未批准字段", async () => {
    const identity = await seedIdentity();
    const project = await createProject(identity.rawToken);

    for (const field of ["deadline", "due_at", "target_at", "completed_at"]) {
      const response = await apiFetch(`/api/v1/projects/${project.id}/milestones`, {
        method: "POST",
        token: identity.rawToken,
        body: { name: "v0.1", [field]: 1 },
      });
      expect(response.status).toBe(400);
    }
  });

  it("跨用户 Project 返回 404", async () => {
    const owner = await seedIdentity();
    const stranger = await seedIdentity();
    const project = await createProject(owner.rawToken);

    const response = await apiFetch(`/api/v1/projects/${project.id}/milestones`, {
      method: "POST",
      token: stranger.rawToken,
      body: { name: "v0.1" },
    });
    expect(response.status).toBe(404);
    expect((await readJson<ErrorBody>(response)).error.code).toBe("PROJECT_NOT_FOUND");
  });

  it("未认证请求被拒绝", async () => {
    const identity = await seedIdentity();
    const project = await createProject(identity.rawToken);

    const response = await apiFetch(`/api/v1/projects/${project.id}/milestones`, {
      method: "POST",
      body: { name: "v0.1" },
    });
    expect(response.status).toBe(401);
  });
});

describe("GET /api/v1/projects/:projectId/milestones", () => {
  it("按 position 升序返回，并支持 status 过滤", async () => {
    const identity = await seedIdentity();
    const project = await createProject(identity.rawToken);

    await createMilestone(identity.rawToken, project.id, { name: "第三", position: 300 });
    await createMilestone(identity.rawToken, project.id, { name: "第一", position: 100 });
    await createMilestone(identity.rawToken, project.id, {
      name: "第二",
      position: 200,
      status: "completed",
    });

    const all = await readJson<MilestoneListBody>(
      await apiFetch(`/api/v1/projects/${project.id}/milestones`, { token: identity.rawToken }),
    );
    expect(all.data.map((item) => item.name)).toEqual(["第一", "第二", "第三"]);

    const completed = await readJson<MilestoneListBody>(
      await apiFetch(`/api/v1/projects/${project.id}/milestones?status=completed`, {
        token: identity.rawToken,
      }),
    );
    expect(completed.data.map((item) => item.name)).toEqual(["第二"]);
  });

  it("只返回当前 Project 的 Milestone", async () => {
    const identity = await seedIdentity();
    const first = await createProject(identity.rawToken, { slug: "first" });
    const second = await createProject(identity.rawToken, { slug: "second" });

    await createMilestone(identity.rawToken, first.id, { name: "属于 first" });
    await createMilestone(identity.rawToken, second.id, { name: "属于 second" });

    const list = await readJson<MilestoneListBody>(
      await apiFetch(`/api/v1/projects/${first.id}/milestones`, { token: identity.rawToken }),
    );
    expect(list.data.map((item) => item.name)).toEqual(["属于 first"]);
  });
});

describe("GET /api/v1/projects/:projectId/milestones/:milestoneId", () => {
  it("返回自己的 Milestone", async () => {
    const identity = await seedIdentity();
    const project = await createProject(identity.rawToken);
    const created = await createMilestone(identity.rawToken, project.id);

    const response = await apiFetch(
      `/api/v1/projects/${project.id}/milestones/${created.id}`,
      { token: identity.rawToken },
    );
    expect(response.status).toBe(200);
    expect((await readJson<MilestoneItemBody>(response)).data.id).toBe(created.id);
  });

  it("跨用户读取返回 404", async () => {
    const owner = await seedIdentity();
    const stranger = await seedIdentity();
    const project = await createProject(owner.rawToken);
    const created = await createMilestone(owner.rawToken, project.id);

    const response = await apiFetch(
      `/api/v1/projects/${project.id}/milestones/${created.id}`,
      { token: stranger.rawToken },
    );
    expect(response.status).toBe(404);
    expect((await readJson<ErrorBody>(response)).error.code).toBe("MILESTONE_NOT_FOUND");
  });

  it("同用户但跨 Project 的 Milestone 返回 404", async () => {
    const identity = await seedIdentity();
    const first = await createProject(identity.rawToken, { slug: "owner-project" });
    const second = await createProject(identity.rawToken, { slug: "other-project" });
    const created = await createMilestone(identity.rawToken, first.id);

    const response = await apiFetch(
      `/api/v1/projects/${second.id}/milestones/${created.id}`,
      { token: identity.rawToken },
    );
    expect(response.status).toBe(404);
  });
});

describe("PATCH /api/v1/projects/:projectId/milestones/:milestoneId", () => {
  it("更新 status 并推进 updated_at", async () => {
    const identity = await seedIdentity();
    const project = await createProject(identity.rawToken);
    const created = await createMilestone(identity.rawToken, project.id);

    const response = await apiFetch(
      `/api/v1/projects/${project.id}/milestones/${created.id}`,
      {
        method: "PATCH",
        token: identity.rawToken,
        body: { status: "completed", name: "v0.1 完成" },
      },
    );

    expect(response.status).toBe(200);
    const body = await readJson<MilestoneItemBody>(response);
    expect(body.data.status).toBe("completed");
    expect(body.data.name).toBe("v0.1 完成");
    expect(Date.parse(body.data.updatedAt)).toBeGreaterThanOrEqual(Date.parse(created.updatedAt));
  });

  it("cancelled 用于替代删除", async () => {
    const identity = await seedIdentity();
    const project = await createProject(identity.rawToken);
    const created = await createMilestone(identity.rawToken, project.id);

    const response = await apiFetch(
      `/api/v1/projects/${project.id}/milestones/${created.id}`,
      { method: "PATCH", token: identity.rawToken, body: { status: "cancelled" } },
    );
    expect(response.status).toBe(200);
    expect((await readJson<MilestoneItemBody>(response)).data.status).toBe("cancelled");
  });

  it("非法 status 返回 400", async () => {
    const identity = await seedIdentity();
    const project = await createProject(identity.rawToken);
    const created = await createMilestone(identity.rawToken, project.id);

    const response = await apiFetch(
      `/api/v1/projects/${project.id}/milestones/${created.id}`,
      { method: "PATCH", token: identity.rawToken, body: { status: "archived" } },
    );
    expect(response.status).toBe(400);
  });

  it("跨用户修改返回 404 且记录不变", async () => {
    const owner = await seedIdentity();
    const stranger = await seedIdentity();
    const project = await createProject(owner.rawToken);
    const created = await createMilestone(owner.rawToken, project.id, { name: "原名" });

    const response = await apiFetch(
      `/api/v1/projects/${project.id}/milestones/${created.id}`,
      { method: "PATCH", token: stranger.rawToken, body: { name: "被篡改" } },
    );
    expect(response.status).toBe(404);

    const reread = await readJson<MilestoneItemBody>(
      await apiFetch(`/api/v1/projects/${project.id}/milestones/${created.id}`, {
        token: owner.rawToken,
      }),
    );
    expect(reread.data.name).toBe("原名");
  });
});

describe("Milestone 不提供 hard delete", () => {
  it("DELETE 路由不存在", async () => {
    const identity = await seedIdentity();
    const project = await createProject(identity.rawToken);
    const created = await createMilestone(identity.rawToken, project.id);

    const response = await apiFetch(
      `/api/v1/projects/${project.id}/milestones/${created.id}`,
      { method: "DELETE", token: identity.rawToken },
    );
    expect(response.status).toBe(404);
  });
});
