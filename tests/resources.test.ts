import { describe, expect, it } from "vitest";

import {
  apiFetch,
  createMilestone,
  createProject,
  createResource,
  createTask,
  readJson,
  seedIdentity,
  type ResourcePayload,
} from "./helpers";

interface ErrorBody {
  success: boolean;
  error: { code: string; message: string };
}

interface ResourceItemBody {
  success: boolean;
  data: ResourcePayload;
}

interface ResourceListBody {
  success: boolean;
  data: ResourcePayload[];
}

describe("POST /api/v1/projects/:projectId/resources", () => {
  it("创建 Project Resource（两个子键都为空）", async () => {
    const identity = await seedIdentity();
    const project = await createProject(identity.rawToken);

    const response = await apiFetch(`/api/v1/projects/${project.id}/resources`, {
      method: "POST",
      token: identity.rawToken,
      body: {
        name: "Iris v0.1 PRD",
        kind: "file",
        role: "spec",
        repository: "OPC_OS",
        path: "docs/prd.md",
      },
    });

    expect(response.status).toBe(201);
    const body = await readJson<ResourceItemBody>(response);
    expect(body.data.milestoneId).toBeNull();
    expect(body.data.taskId).toBeNull();
    expect(body.data.repository).toBe("OPC_OS");
    expect(body.data.path).toBe("docs/prd.md");
    expect(body.data.url).toBeNull();
  });

  it("创建 Milestone Resource", async () => {
    const identity = await seedIdentity();
    const project = await createProject(identity.rawToken);
    const milestone = await createMilestone(identity.rawToken, project.id);

    const created = await createResource(identity.rawToken, project.id, {
      milestone_id: milestone.id,
    });

    expect(created.milestoneId).toBe(milestone.id);
    expect(created.taskId).toBeNull();
  });

  it("创建 Task Resource 且不重复存 milestone_id", async () => {
    const identity = await seedIdentity();
    const project = await createProject(identity.rawToken);
    const milestone = await createMilestone(identity.rawToken, project.id);
    const task = await createTask(identity.rawToken, project.id, { milestone_id: milestone.id });

    const created = await createResource(identity.rawToken, project.id, { task_id: task.id });

    expect(created.taskId).toBe(task.id);
    expect(created.milestoneId).toBeNull();
  });

  it("支持 kind = repository / url 的最小必填组合", async () => {
    const identity = await seedIdentity();
    const project = await createProject(identity.rawToken);

    const repo = await createResource(identity.rawToken, project.id, {
      kind: "repository",
      role: "context",
      repository: "OPC_OS",
      path: null,
      url: null,
    });
    expect(repo.kind).toBe("repository");

    const url = await createResource(identity.rawToken, project.id, {
      kind: "url",
      role: "reference",
      repository: null,
      path: null,
      url: "https://example.com/spec",
    });
    expect(url.url).toBe("https://example.com/spec");
  });

  it("milestone_id 与 task_id 同时存在返回 422 INVALID_RESOURCE_SCOPE", async () => {
    const identity = await seedIdentity();
    const project = await createProject(identity.rawToken);
    const milestone = await createMilestone(identity.rawToken, project.id);
    const task = await createTask(identity.rawToken, project.id);

    const response = await apiFetch(`/api/v1/projects/${project.id}/resources`, {
      method: "POST",
      token: identity.rawToken,
      body: {
        name: "非法归属",
        kind: "file",
        role: "spec",
        repository: "OPC_OS",
        path: "docs/a.md",
        milestone_id: milestone.id,
        task_id: task.id,
      },
    });

    expect(response.status).toBe(422);
    expect((await readJson<ErrorBody>(response)).error.code).toBe("INVALID_RESOURCE_SCOPE");
  });

  it.each([
    ["file 缺 repository/path", { kind: "file", repository: null, path: null, url: null }],
    ["file 只有 repository", { kind: "file", repository: "OPC_OS", path: null, url: null }],
    ["directory 缺 repository/path", { kind: "directory", repository: null, path: null, url: null }],
    ["repository 缺 repository", { kind: "repository", repository: null, path: null, url: null }],
    ["url 缺 url", { kind: "url", repository: null, path: null, url: null }],
  ])("%s 返回 422 INVALID_RESOURCE_LOCATION", async (_label, overrides) => {
    const identity = await seedIdentity();
    const project = await createProject(identity.rawToken);

    const response = await apiFetch(`/api/v1/projects/${project.id}/resources`, {
      method: "POST",
      token: identity.rawToken,
      body: { name: "不完整", role: "spec", ...overrides },
    });

    expect(response.status).toBe(422);
    expect((await readJson<ErrorBody>(response)).error.code).toBe("INVALID_RESOURCE_LOCATION");
  });

  it("Milestone 不属于该 Project 时返回 404", async () => {
    const identity = await seedIdentity();
    const first = await createProject(identity.rawToken, { slug: "first" });
    const second = await createProject(identity.rawToken, { slug: "second" });
    const foreign = await createMilestone(identity.rawToken, second.id);

    const response = await apiFetch(`/api/v1/projects/${first.id}/resources`, {
      method: "POST",
      token: identity.rawToken,
      body: {
        name: "跨 Project",
        kind: "file",
        role: "spec",
        repository: "OPC_OS",
        path: "docs/a.md",
        milestone_id: foreign.id,
      },
    });

    expect(response.status).toBe(404);
    expect((await readJson<ErrorBody>(response)).error.code).toBe("MILESTONE_NOT_FOUND");
  });

  it("Task 不属于该 Project 时返回 404", async () => {
    const identity = await seedIdentity();
    const first = await createProject(identity.rawToken, { slug: "first" });
    const second = await createProject(identity.rawToken, { slug: "second" });
    const foreign = await createTask(identity.rawToken, second.id);

    const response = await apiFetch(`/api/v1/projects/${first.id}/resources`, {
      method: "POST",
      token: identity.rawToken,
      body: {
        name: "跨 Project",
        kind: "file",
        role: "spec",
        repository: "OPC_OS",
        path: "docs/a.md",
        task_id: foreign.id,
      },
    });

    expect(response.status).toBe(404);
    expect((await readJson<ErrorBody>(response)).error.code).toBe("TASK_NOT_FOUND");
  });

  it("拒绝只读字段与非枚举 kind / role", async () => {
    const identity = await seedIdentity();
    const project = await createProject(identity.rawToken);

    const withReadonly = await apiFetch(`/api/v1/projects/${project.id}/resources`, {
      method: "POST",
      token: identity.rawToken,
      body: { name: "x", kind: "file", role: "spec", repository: "r", path: "p", project_id: project.id },
    });
    expect(withReadonly.status).toBe(400);

    const badKind = await apiFetch(`/api/v1/projects/${project.id}/resources`, {
      method: "POST",
      token: identity.rawToken,
      body: { name: "x", kind: "s3", role: "spec", repository: "r", path: "p" },
    });
    expect(badKind.status).toBe(400);

    const badRole = await apiFetch(`/api/v1/projects/${project.id}/resources`, {
      method: "POST",
      token: identity.rawToken,
      body: { name: "x", kind: "file", role: "secret", repository: "r", path: "p" },
    });
    expect(badRole.status).toBe(400);
  });

  it("未认证请求被拒绝", async () => {
    const identity = await seedIdentity();
    const project = await createProject(identity.rawToken);

    const response = await apiFetch(`/api/v1/projects/${project.id}/resources`, {
      method: "POST",
      body: { name: "x", kind: "file", role: "spec", repository: "r", path: "p" },
    });
    expect(response.status).toBe(401);
  });
});

describe("GET /api/v1/projects/:projectId/resources", () => {
  it("返回 Project 下全部 metadata 并支持 kind / role / 归属过滤", async () => {
    const identity = await seedIdentity();
    const project = await createProject(identity.rawToken);
    const milestone = await createMilestone(identity.rawToken, project.id);

    await createResource(identity.rawToken, project.id, { name: "项目级" });
    await createResource(identity.rawToken, project.id, {
      name: "里程碑级",
      milestone_id: milestone.id,
    });
    await createResource(identity.rawToken, project.id, {
      name: "外部参考",
      kind: "url",
      role: "reference",
      repository: null,
      path: null,
      url: "https://example.com",
    });

    const all = await readJson<ResourceListBody>(
      await apiFetch(`/api/v1/projects/${project.id}/resources`, { token: identity.rawToken }),
    );
    expect(all.data).toHaveLength(3);

    const urls = await readJson<ResourceListBody>(
      await apiFetch(`/api/v1/projects/${project.id}/resources?kind=url`, {
        token: identity.rawToken,
      }),
    );
    expect(urls.data.map((item) => item.name)).toEqual(["外部参考"]);

    const byMilestone = await readJson<ResourceListBody>(
      await apiFetch(`/api/v1/projects/${project.id}/resources?milestone_id=${milestone.id}`, {
        token: identity.rawToken,
      }),
    );
    expect(byMilestone.data.map((item) => item.name)).toEqual(["里程碑级"]);
  });
});

describe("PATCH /api/v1/projects/:projectId/resources/:resourceId", () => {
  it("修改后重新执行完整校验并推进 updated_at", async () => {
    const identity = await seedIdentity();
    const project = await createProject(identity.rawToken);
    const resource = await createResource(identity.rawToken, project.id);

    const response = await apiFetch(
      `/api/v1/projects/${project.id}/resources/${resource.id}`,
      {
        method: "PATCH",
        token: identity.rawToken,
        body: { name: "改名", role: "artifact" },
      },
    );

    expect(response.status).toBe(200);
    const body = await readJson<ResourceItemBody>(response);
    expect(body.data.name).toBe("改名");
    expect(body.data.role).toBe("artifact");
    expect(Date.parse(body.data.updatedAt)).toBeGreaterThanOrEqual(Date.parse(resource.updatedAt));
  });

  it("只改一个字段也不会放过合并后的非法组合", async () => {
    const identity = await seedIdentity();
    const project = await createProject(identity.rawToken);
    const milestone = await createMilestone(identity.rawToken, project.id);
    const resource = await createResource(identity.rawToken, project.id, {
      milestone_id: milestone.id,
    });
    const task = await createTask(identity.rawToken, project.id);

    // 原记录已有 milestone_id，这里再补 task_id 会构成互斥冲突。
    const response = await apiFetch(
      `/api/v1/projects/${project.id}/resources/${resource.id}`,
      { method: "PATCH", token: identity.rawToken, body: { task_id: task.id } },
    );

    expect(response.status).toBe(422);
    expect((await readJson<ErrorBody>(response)).error.code).toBe("INVALID_RESOURCE_SCOPE");
  });

  it("改成不满足 location 的 kind 返回 422 且记录不变", async () => {
    const identity = await seedIdentity();
    const project = await createProject(identity.rawToken);
    const resource = await createResource(identity.rawToken, project.id);

    const response = await apiFetch(
      `/api/v1/projects/${project.id}/resources/${resource.id}`,
      { method: "PATCH", token: identity.rawToken, body: { kind: "url" } },
    );

    expect(response.status).toBe(422);
    expect((await readJson<ErrorBody>(response)).error.code).toBe("INVALID_RESOURCE_LOCATION");

    const reread = await readJson<ResourceItemBody>(
      await apiFetch(`/api/v1/projects/${project.id}/resources/${resource.id}`, {
        token: identity.rawToken,
      }),
    );
    expect(reread.data.kind).toBe("file");
  });

  it("跨用户修改返回 404", async () => {
    const owner = await seedIdentity();
    const stranger = await seedIdentity();
    const project = await createProject(owner.rawToken);
    const resource = await createResource(owner.rawToken, project.id, { name: "原名" });

    const response = await apiFetch(
      `/api/v1/projects/${project.id}/resources/${resource.id}`,
      { method: "PATCH", token: stranger.rawToken, body: { name: "被篡改" } },
    );
    expect(response.status).toBe(404);
  });
});

describe("DELETE /api/v1/projects/:projectId/resources/:resourceId", () => {
  it("未被引用时删除成功并返回 204", async () => {
    const identity = await seedIdentity();
    const project = await createProject(identity.rawToken);
    const resource = await createResource(identity.rawToken, project.id);

    const response = await apiFetch(
      `/api/v1/projects/${project.id}/resources/${resource.id}`,
      { method: "DELETE", token: identity.rawToken },
    );
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");

    const reread = await apiFetch(`/api/v1/projects/${project.id}/resources/${resource.id}`, {
      token: identity.rawToken,
    });
    expect(reread.status).toBe(404);
  });

  it("跨用户删除返回 404 且记录仍在", async () => {
    const owner = await seedIdentity();
    const stranger = await seedIdentity();
    const project = await createProject(owner.rawToken);
    const resource = await createResource(owner.rawToken, project.id);

    const response = await apiFetch(
      `/api/v1/projects/${project.id}/resources/${resource.id}`,
      { method: "DELETE", token: stranger.rawToken },
    );
    expect(response.status).toBe(404);

    const reread = await apiFetch(`/api/v1/projects/${project.id}/resources/${resource.id}`, {
      token: owner.rawToken,
    });
    expect(reread.status).toBe(200);
  });
});
