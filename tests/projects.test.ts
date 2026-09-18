import { describe, expect, it } from "vitest";

import { apiFetch, createProject, readJson, seedIdentity, type ProjectPayload } from "./helpers";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

interface ErrorBody {
  success: boolean;
  error: { code: string; message: string };
}

interface ProjectListBody {
  success: boolean;
  data: ProjectPayload[];
}

interface ProjectItemBody {
  success: boolean;
  data: ProjectPayload;
}

describe("POST /api/v1/projects", () => {
  it("创建成功返回 201 与服务端赋值的字段", async () => {
    const identity = await seedIdentity();
    const response = await apiFetch("/api/v1/projects", {
      method: "POST",
      token: identity.rawToken,
      body: { name: "Iris", slug: "iris" },
    });

    expect(response.status).toBe(201);
    const body = await readJson<ProjectItemBody>(response);
    expect(body.success).toBe(true);
    expect(body.data.id).toMatch(UUID_V4);
    expect(body.data.name).toBe("Iris");
    expect(body.data.slug).toBe("iris");
    expect(body.data.description).toBeNull();
    expect(body.data.kind).toBe("other");
    expect(body.data.status).toBe("planned");
    expect(body.data.archivedAt).toBeNull();
    expect(Number.isNaN(Date.parse(body.data.createdAt))).toBe(false);
    expect(body.data.updatedAt).toBe(body.data.createdAt);
  });

  it("接受显式 kind 与 status，并保留合法 slug 原文", async () => {
    const identity = await seedIdentity();
    const created = await createProject(identity.rawToken, {
      slug: "novel-2026",
      kind: "content",
      status: "active",
      description: "长篇小说",
    });

    expect(created.slug).toBe("novel-2026");
    expect(created.kind).toBe("content");
    expect(created.status).toBe("active");
    expect(created.description).toBe("长篇小说");
  });

  it("同一用户下 slug 冲突返回 409 SLUG_ALREADY_EXISTS", async () => {
    const identity = await seedIdentity();
    await createProject(identity.rawToken, { slug: "duplicate" });

    const response = await apiFetch("/api/v1/projects", {
      method: "POST",
      token: identity.rawToken,
      body: { name: "另一个", slug: "duplicate" },
    });

    expect(response.status).toBe(409);
    const body = await readJson<ErrorBody>(response);
    expect(body.error.code).toBe("SLUG_ALREADY_EXISTS");
  });

  it("两个不同用户可以各自使用同一个 slug", async () => {
    const first = await seedIdentity();
    const second = await seedIdentity();

    const a = await createProject(first.rawToken, { slug: "shared-slug" });
    const b = await createProject(second.rawToken, { slug: "shared-slug" });

    expect(a.slug).toBe("shared-slug");
    expect(b.slug).toBe("shared-slug");
    expect(a.id).not.toBe(b.id);
  });

  it("拒绝非法 slug 与非枚举 kind", async () => {
    const identity = await seedIdentity();

    const badSlug = await apiFetch("/api/v1/projects", {
      method: "POST",
      token: identity.rawToken,
      body: { name: "Iris", slug: "Iris Project" },
    });
    expect(badSlug.status).toBe(400);
    expect((await readJson<ErrorBody>(badSlug)).error.code).toBe("BAD_REQUEST");

    const badKind = await apiFetch("/api/v1/projects", {
      method: "POST",
      token: identity.rawToken,
      body: { name: "Iris", slug: "iris", kind: "unknown" },
    });
    expect(badKind.status).toBe(400);
    expect((await readJson<ErrorBody>(badKind)).error.code).toBe("BAD_REQUEST");
  });

  it("拒绝客户端提交只读字段与缺失必填字段", async () => {
    const identity = await seedIdentity();

    const withReadonly = await apiFetch("/api/v1/projects", {
      method: "POST",
      token: identity.rawToken,
      body: { name: "Iris", slug: "iris", user_id: crypto.randomUUID() },
    });
    expect(withReadonly.status).toBe(400);

    const missingSlug = await apiFetch("/api/v1/projects", {
      method: "POST",
      token: identity.rawToken,
      body: { name: "Iris" },
    });
    expect(missingSlug.status).toBe(400);
  });

  it("未认证请求被拒绝", async () => {
    const response = await apiFetch("/api/v1/projects", {
      method: "POST",
      body: { name: "Iris", slug: "iris" },
    });
    expect(response.status).toBe(401);
  });
});

describe("GET /api/v1/projects", () => {
  it("默认不返回已归档 Project，include_archived=true 时包含", async () => {
    const identity = await seedIdentity();
    const kept = await createProject(identity.rawToken, { slug: "kept" });
    const archived = await createProject(identity.rawToken, { slug: "archived" });

    await apiFetch(`/api/v1/projects/${archived.id}/archive`, {
      method: "POST",
      token: identity.rawToken,
    });

    const defaultList = await readJson<ProjectListBody>(
      await apiFetch("/api/v1/projects", { token: identity.rawToken }),
    );
    expect(defaultList.data.map((item) => item.id)).toEqual([kept.id]);

    const all = await readJson<ProjectListBody>(
      await apiFetch("/api/v1/projects?include_archived=true", { token: identity.rawToken }),
    );
    expect(all.data.map((item) => item.id).sort()).toEqual([kept.id, archived.id].sort());
  });

  it("include_archived=false 不会被按 JS truthy 解析成 true", async () => {
    const identity = await seedIdentity();
    await createProject(identity.rawToken, { slug: "visible" });
    const archived = await createProject(identity.rawToken, { slug: "hidden" });
    await apiFetch(`/api/v1/projects/${archived.id}/archive`, {
      method: "POST",
      token: identity.rawToken,
    });

    const body = await readJson<ProjectListBody>(
      await apiFetch("/api/v1/projects?include_archived=false", { token: identity.rawToken }),
    );
    expect(body.data.map((item) => item.slug)).toEqual(["visible"]);
  });

  it("支持 status 与 kind 过滤", async () => {
    const identity = await seedIdentity();
    await createProject(identity.rawToken, { slug: "a", status: "active", kind: "product" });
    await createProject(identity.rawToken, { slug: "b", status: "planned", kind: "content" });

    const byStatus = await readJson<ProjectListBody>(
      await apiFetch("/api/v1/projects?status=active", { token: identity.rawToken }),
    );
    expect(byStatus.data.map((item) => item.slug)).toEqual(["a"]);

    const byKind = await readJson<ProjectListBody>(
      await apiFetch("/api/v1/projects?kind=content", { token: identity.rawToken }),
    );
    expect(byKind.data.map((item) => item.slug)).toEqual(["b"]);
  });

  it("只返回当前用户的 Project", async () => {
    const first = await seedIdentity();
    const second = await seedIdentity();
    await createProject(first.rawToken, { slug: "mine" });
    await createProject(second.rawToken, { slug: "theirs" });

    const body = await readJson<ProjectListBody>(
      await apiFetch("/api/v1/projects", { token: first.rawToken }),
    );
    expect(body.data.map((item) => item.slug)).toEqual(["mine"]);
  });

  it("未认证请求被拒绝", async () => {
    expect((await apiFetch("/api/v1/projects")).status).toBe(401);
  });
});

describe("GET /api/v1/projects/:projectId", () => {
  it("返回自己的 Project", async () => {
    const identity = await seedIdentity();
    const created = await createProject(identity.rawToken);

    const response = await apiFetch(`/api/v1/projects/${created.id}`, {
      token: identity.rawToken,
    });
    expect(response.status).toBe(200);
    expect((await readJson<ProjectItemBody>(response)).data.id).toBe(created.id);
  });

  it("跨用户读取返回 404 而不是 403", async () => {
    const owner = await seedIdentity();
    const stranger = await seedIdentity();
    const created = await createProject(owner.rawToken);

    const response = await apiFetch(`/api/v1/projects/${created.id}`, {
      token: stranger.rawToken,
    });
    expect(response.status).toBe(404);
    const body = await readJson<ErrorBody>(response);
    expect(body.error.code).toBe("PROJECT_NOT_FOUND");
    expect(JSON.stringify(body)).not.toContain("another user");
  });

  it("不存在的 Project 返回 404", async () => {
    const identity = await seedIdentity();
    const response = await apiFetch(`/api/v1/projects/${crypto.randomUUID()}`, {
      token: identity.rawToken,
    });
    expect(response.status).toBe(404);
  });
});

describe("PATCH /api/v1/projects/:projectId", () => {
  it("更新允许字段并推进 updated_at", async () => {
    const identity = await seedIdentity();
    const created = await createProject(identity.rawToken, { slug: "before" });

    const response = await apiFetch(`/api/v1/projects/${created.id}`, {
      method: "PATCH",
      token: identity.rawToken,
      body: { name: "改名", slug: "after", description: "新描述", status: "active" },
    });

    expect(response.status).toBe(200);
    const body = await readJson<ProjectItemBody>(response);
    expect(body.data.name).toBe("改名");
    expect(body.data.slug).toBe("after");
    expect(body.data.description).toBe("新描述");
    expect(body.data.status).toBe("active");
    expect(Date.parse(body.data.updatedAt)).toBeGreaterThanOrEqual(Date.parse(created.updatedAt));
  });

  it("拒绝直接修改只读字段", async () => {
    const identity = await seedIdentity();
    const created = await createProject(identity.rawToken);

    const response = await apiFetch(`/api/v1/projects/${created.id}`, {
      method: "PATCH",
      token: identity.rawToken,
      body: { archived_at: 123 },
    });
    expect(response.status).toBe(400);
  });

  it("跨用户修改返回 404 且原记录不变", async () => {
    const owner = await seedIdentity();
    const stranger = await seedIdentity();
    const created = await createProject(owner.rawToken, { name: "原名" });

    const response = await apiFetch(`/api/v1/projects/${created.id}`, {
      method: "PATCH",
      token: stranger.rawToken,
      body: { name: "被篡改" },
    });
    expect(response.status).toBe(404);

    const reread = await readJson<ProjectItemBody>(
      await apiFetch(`/api/v1/projects/${created.id}`, { token: owner.rawToken }),
    );
    expect(reread.data.name).toBe("原名");
  });

  it("改成已被占用的 slug 返回 409", async () => {
    const identity = await seedIdentity();
    await createProject(identity.rawToken, { slug: "taken" });
    const other = await createProject(identity.rawToken, { slug: "free" });

    const response = await apiFetch(`/api/v1/projects/${other.id}`, {
      method: "PATCH",
      token: identity.rawToken,
      body: { slug: "taken" },
    });
    expect(response.status).toBe(409);
    expect((await readJson<ErrorBody>(response)).error.code).toBe("SLUG_ALREADY_EXISTS");
  });
});

describe("archive / unarchive", () => {
  it("归档后 archived_at 非空且列表默认隐藏", async () => {
    const identity = await seedIdentity();
    const created = await createProject(identity.rawToken);

    const archived = await apiFetch(`/api/v1/projects/${created.id}/archive`, {
      method: "POST",
      token: identity.rawToken,
    });
    expect(archived.status).toBe(200);
    const body = await readJson<ProjectItemBody>(archived);
    expect(body.data.archivedAt).not.toBeNull();
    expect(body.data.status).not.toBe("archived");
  });

  it("重复归档保持幂等，不推进 archived_at", async () => {
    const identity = await seedIdentity();
    const created = await createProject(identity.rawToken);

    const first = await readJson<ProjectItemBody>(
      await apiFetch(`/api/v1/projects/${created.id}/archive`, {
        method: "POST",
        token: identity.rawToken,
      }),
    );
    const second = await readJson<ProjectItemBody>(
      await apiFetch(`/api/v1/projects/${created.id}/archive`, {
        method: "POST",
        token: identity.rawToken,
      }),
    );

    expect(second.data.archivedAt).toBe(first.data.archivedAt);
    expect(second.data.updatedAt).toBe(first.data.updatedAt);
  });

  it("取消归档后 archived_at 恢复为 null", async () => {
    const identity = await seedIdentity();
    const created = await createProject(identity.rawToken);
    await apiFetch(`/api/v1/projects/${created.id}/archive`, {
      method: "POST",
      token: identity.rawToken,
    });

    const restored = await readJson<ProjectItemBody>(
      await apiFetch(`/api/v1/projects/${created.id}/unarchive`, {
        method: "POST",
        token: identity.rawToken,
      }),
    );
    expect(restored.data.archivedAt).toBeNull();
  });

  it("未归档时取消归档保持幂等", async () => {
    const identity = await seedIdentity();
    const created = await createProject(identity.rawToken);

    const response = await apiFetch(`/api/v1/projects/${created.id}/unarchive`, {
      method: "POST",
      token: identity.rawToken,
    });
    expect(response.status).toBe(200);
    const body = await readJson<ProjectItemBody>(response);
    expect(body.data.archivedAt).toBeNull();
    expect(body.data.updatedAt).toBe(created.updatedAt);
  });

  it("跨用户归档返回 404", async () => {
    const owner = await seedIdentity();
    const stranger = await seedIdentity();
    const created = await createProject(owner.rawToken);

    const response = await apiFetch(`/api/v1/projects/${created.id}/archive`, {
      method: "POST",
      token: stranger.rawToken,
    });
    expect(response.status).toBe(404);
  });
});

describe("Project 不提供 hard delete", () => {
  it("DELETE 路由不存在", async () => {
    const identity = await seedIdentity();
    const created = await createProject(identity.rawToken);

    const response = await apiFetch(`/api/v1/projects/${created.id}`, {
      method: "DELETE",
      token: identity.rawToken,
    });
    expect(response.status).toBe(404);

    const stillThere = await apiFetch(`/api/v1/projects/${created.id}`, {
      token: identity.rawToken,
    });
    expect(stillThere.status).toBe(200);
  });
});
