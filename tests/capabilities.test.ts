import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import {
  apiFetch,
  createCapability,
  createProject,
  createResource,
  readJson,
  seedIdentity,
  type CapabilityPayload,
} from "./helpers";

interface ErrorBody {
  success: boolean;
  error: { code: string; message: string };
}

interface CapabilityItemBody {
  success: boolean;
  data: CapabilityPayload;
}

interface CapabilityListBody {
  success: boolean;
  data: CapabilityPayload[];
}

const SCRIPT_FILE = {
  name: "Check Provider Script",
  kind: "file",
  role: "spec",
  repository: "OPC_OS",
  path: "scripts/check-provider.ts",
};

const SKILL_DIRECTORY = {
  name: "Project Secretary Skill",
  kind: "directory",
  role: "artifact",
  repository: "OPC_OS",
  path: "skills/project-secretary/",
};

describe("POST /api/v1/projects/:projectId/capabilities", () => {
  it("script Capability + file Resource 创建成功且 enabled 默认 true", async () => {
    const identity = await seedIdentity();
    const project = await createProject(identity.rawToken);
    const resource = await createResource(identity.rawToken, project.id, SCRIPT_FILE);

    const response = await apiFetch(`/api/v1/projects/${project.id}/capabilities`, {
      method: "POST",
      token: identity.rawToken,
      body: { name: "Check Provider Health", type: "script", resource_id: resource.id },
    });

    expect(response.status).toBe(201);
    const body = await readJson<CapabilityItemBody>(response);
    expect(body.data.projectId).toBe(project.id);
    expect(body.data.type).toBe("script");
    expect(body.data.resourceId).toBe(resource.id);
    expect(body.data.enabled).toBe(true);
    expect(body.data.description).toBeNull();
  });

  it("skill Capability + directory Resource 创建成功", async () => {
    const identity = await seedIdentity();
    const project = await createProject(identity.rawToken);
    const resource = await createResource(identity.rawToken, project.id, SKILL_DIRECTORY);

    const created = await createCapability(identity.rawToken, project.id, resource.id, {
      name: "Project Secretary",
      type: "skill",
    });

    expect(created.type).toBe("skill");
    expect(created.resourceId).toBe(resource.id);
  });

  it("script + directory Resource 返回 422 INVALID_CAPABILITY_RESOURCE_KIND", async () => {
    const identity = await seedIdentity();
    const project = await createProject(identity.rawToken);
    const resource = await createResource(identity.rawToken, project.id, SKILL_DIRECTORY);

    const response = await apiFetch(`/api/v1/projects/${project.id}/capabilities`, {
      method: "POST",
      token: identity.rawToken,
      body: { name: "错配", type: "script", resource_id: resource.id },
    });

    expect(response.status).toBe(422);
    expect((await readJson<ErrorBody>(response)).error.code).toBe(
      "INVALID_CAPABILITY_RESOURCE_KIND",
    );
  });

  it("skill + file Resource 返回 422 INVALID_CAPABILITY_RESOURCE_KIND", async () => {
    const identity = await seedIdentity();
    const project = await createProject(identity.rawToken);
    const resource = await createResource(identity.rawToken, project.id, SCRIPT_FILE);

    const response = await apiFetch(`/api/v1/projects/${project.id}/capabilities`, {
      method: "POST",
      token: identity.rawToken,
      body: { name: "错配", type: "skill", resource_id: resource.id },
    });

    expect(response.status).toBe(422);
    expect((await readJson<ErrorBody>(response)).error.code).toBe(
      "INVALID_CAPABILITY_RESOURCE_KIND",
    );
  });

  it("引用其他 Project 的 Resource 统一返回 404 RESOURCE_NOT_FOUND", async () => {
    const identity = await seedIdentity();
    const first = await createProject(identity.rawToken, { slug: "first" });
    const second = await createProject(identity.rawToken, { slug: "second" });
    const foreign = await createResource(identity.rawToken, second.id, SCRIPT_FILE);

    const response = await apiFetch(`/api/v1/projects/${first.id}/capabilities`, {
      method: "POST",
      token: identity.rawToken,
      body: { name: "跨 Project", type: "script", resource_id: foreign.id },
    });

    expect(response.status).toBe(404);
    const body = await readJson<ErrorBody>(response);
    expect(body.error.code).toBe("RESOURCE_NOT_FOUND");
    expect(JSON.stringify(body)).not.toContain("CAPABILITY_RESOURCE_PROJECT_MISMATCH");
  });

  it("引用其他 User 的 Resource 返回 404 且不泄露存在性", async () => {
    const owner = await seedIdentity();
    const stranger = await seedIdentity();
    const ownerProject = await createProject(owner.rawToken);
    const strangerProject = await createProject(stranger.rawToken);
    const ownerResource = await createResource(owner.rawToken, ownerProject.id, SCRIPT_FILE);

    const response = await apiFetch(`/api/v1/projects/${strangerProject.id}/capabilities`, {
      method: "POST",
      token: stranger.rawToken,
      body: { name: "越权", type: "script", resource_id: ownerResource.id },
    });

    expect(response.status).toBe(404);
    expect((await readJson<ErrorBody>(response)).error.code).toBe("RESOURCE_NOT_FOUND");
  });

  it("缺少 resource_id 返回 400 BAD_REQUEST", async () => {
    const identity = await seedIdentity();
    const project = await createProject(identity.rawToken);

    const response = await apiFetch(`/api/v1/projects/${project.id}/capabilities`, {
      method: "POST",
      token: identity.rawToken,
      body: { name: "无引用", type: "script" },
    });

    expect(response.status).toBe(400);
    expect((await readJson<ErrorBody>(response)).error.code).toBe("BAD_REQUEST");
  });

  it("非法 type 与只读字段返回 400", async () => {
    const identity = await seedIdentity();
    const project = await createProject(identity.rawToken);
    const resource = await createResource(identity.rawToken, project.id, SCRIPT_FILE);

    const badType = await apiFetch(`/api/v1/projects/${project.id}/capabilities`, {
      method: "POST",
      token: identity.rawToken,
      body: { name: "x", type: "http", resource_id: resource.id },
    });
    expect(badType.status).toBe(400);

    const withReadonly = await apiFetch(`/api/v1/projects/${project.id}/capabilities`, {
      method: "POST",
      token: identity.rawToken,
      body: {
        name: "x",
        type: "script",
        resource_id: resource.id,
        project_id: crypto.randomUUID(),
      },
    });
    expect(withReadonly.status).toBe(400);
  });

  it("同一个 Resource 可以暴露多个 Capability", async () => {
    const identity = await seedIdentity();
    const project = await createProject(identity.rawToken);
    const resource = await createResource(identity.rawToken, project.id, SKILL_DIRECTORY);

    const first = await createCapability(identity.rawToken, project.id, resource.id, {
      name: "Research",
      type: "skill",
    });
    const second = await createCapability(identity.rawToken, project.id, resource.id, {
      name: "Summarize",
      type: "skill",
    });

    expect(first.id).not.toBe(second.id);
    expect(first.resourceId).toBe(second.resourceId);
  });

  it("未认证请求被拒绝", async () => {
    const identity = await seedIdentity();
    const project = await createProject(identity.rawToken);
    const resource = await createResource(identity.rawToken, project.id, SCRIPT_FILE);

    const response = await apiFetch(`/api/v1/projects/${project.id}/capabilities`, {
      method: "POST",
      body: { name: "x", type: "script", resource_id: resource.id },
    });
    expect(response.status).toBe(401);
  });
});

describe("GET /api/v1/projects/:projectId/capabilities", () => {
  it("按 type 与 enabled 过滤", async () => {
    const identity = await seedIdentity();
    const project = await createProject(identity.rawToken);
    const scriptResource = await createResource(identity.rawToken, project.id, SCRIPT_FILE);
    const skillResource = await createResource(identity.rawToken, project.id, SKILL_DIRECTORY);

    await createCapability(identity.rawToken, project.id, scriptResource.id, { name: "脚本能力" });
    const skill = await createCapability(identity.rawToken, project.id, skillResource.id, {
      name: "技能能力",
      type: "skill",
    });
    await apiFetch(`/api/v1/projects/${project.id}/capabilities/${skill.id}/disable`, {
      method: "POST",
      token: identity.rawToken,
    });

    const scripts = await readJson<CapabilityListBody>(
      await apiFetch(`/api/v1/projects/${project.id}/capabilities?type=script`, {
        token: identity.rawToken,
      }),
    );
    expect(scripts.data.map((item) => item.name)).toEqual(["脚本能力"]);

    const enabled = await readJson<CapabilityListBody>(
      await apiFetch(`/api/v1/projects/${project.id}/capabilities?enabled=true`, {
        token: identity.rawToken,
      }),
    );
    expect(enabled.data.map((item) => item.name)).toEqual(["脚本能力"]);

    const disabled = await readJson<CapabilityListBody>(
      await apiFetch(`/api/v1/projects/${project.id}/capabilities?enabled=false`, {
        token: identity.rawToken,
      }),
    );
    expect(disabled.data.map((item) => item.name)).toEqual(["技能能力"]);
  });
});

describe("GET /api/v1/projects/:projectId/capabilities/:capabilityId", () => {
  it("跨用户读取返回 404", async () => {
    const owner = await seedIdentity();
    const stranger = await seedIdentity();
    const project = await createProject(owner.rawToken);
    const resource = await createResource(owner.rawToken, project.id, SCRIPT_FILE);
    const capability = await createCapability(owner.rawToken, project.id, resource.id);

    const response = await apiFetch(
      `/api/v1/projects/${project.id}/capabilities/${capability.id}`,
      { token: stranger.rawToken },
    );

    expect(response.status).toBe(404);
    expect((await readJson<ErrorBody>(response)).error.code).toBe("CAPABILITY_NOT_FOUND");
  });
});

describe("PATCH /api/v1/projects/:projectId/capabilities/:capabilityId", () => {
  it("更新 name 与 description", async () => {
    const identity = await seedIdentity();
    const project = await createProject(identity.rawToken);
    const resource = await createResource(identity.rawToken, project.id, SCRIPT_FILE);
    const capability = await createCapability(identity.rawToken, project.id, resource.id);

    const response = await apiFetch(
      `/api/v1/projects/${project.id}/capabilities/${capability.id}`,
      {
        method: "PATCH",
        token: identity.rawToken,
        body: { name: "改名", description: "健康检查" },
      },
    );

    expect(response.status).toBe(200);
    const body = await readJson<CapabilityItemBody>(response);
    expect(body.data.name).toBe("改名");
    expect(body.data.description).toBe("健康检查");
    expect(Date.parse(body.data.updatedAt)).toBeGreaterThanOrEqual(
      Date.parse(capability.updatedAt),
    );
  });

  it("改 resource_id 后重新验证归属，跨 Project 返回 404", async () => {
    const identity = await seedIdentity();
    const first = await createProject(identity.rawToken, { slug: "first" });
    const second = await createProject(identity.rawToken, { slug: "second" });
    const own = await createResource(identity.rawToken, first.id, SCRIPT_FILE);
    const foreign = await createResource(identity.rawToken, second.id, SCRIPT_FILE);
    const capability = await createCapability(identity.rawToken, first.id, own.id);

    const response = await apiFetch(
      `/api/v1/projects/${first.id}/capabilities/${capability.id}`,
      { method: "PATCH", token: identity.rawToken, body: { resource_id: foreign.id } },
    );

    expect(response.status).toBe(404);
    expect((await readJson<ErrorBody>(response)).error.code).toBe("RESOURCE_NOT_FOUND");
  });

  it("改 type 后重新验证 Resource kind", async () => {
    const identity = await seedIdentity();
    const project = await createProject(identity.rawToken);
    const resource = await createResource(identity.rawToken, project.id, SCRIPT_FILE);
    const capability = await createCapability(identity.rawToken, project.id, resource.id);

    const response = await apiFetch(
      `/api/v1/projects/${project.id}/capabilities/${capability.id}`,
      { method: "PATCH", token: identity.rawToken, body: { type: "skill" } },
    );

    expect(response.status).toBe(422);
    expect((await readJson<ErrorBody>(response)).error.code).toBe(
      "INVALID_CAPABILITY_RESOURCE_KIND",
    );

    const reread = await readJson<CapabilityItemBody>(
      await apiFetch(`/api/v1/projects/${project.id}/capabilities/${capability.id}`, {
        token: identity.rawToken,
      }),
    );
    expect(reread.data.type).toBe("script");
  });

  it("可用 enabled 字段直接禁用", async () => {
    const identity = await seedIdentity();
    const project = await createProject(identity.rawToken);
    const resource = await createResource(identity.rawToken, project.id, SCRIPT_FILE);
    const capability = await createCapability(identity.rawToken, project.id, resource.id);

    const response = await apiFetch(
      `/api/v1/projects/${project.id}/capabilities/${capability.id}`,
      { method: "PATCH", token: identity.rawToken, body: { enabled: false } },
    );

    expect((await readJson<CapabilityItemBody>(response)).data.enabled).toBe(false);
  });
});

describe("enable / disable", () => {
  it("disable 后 enable 可恢复，且重复调用保持幂等", async () => {
    const identity = await seedIdentity();
    const project = await createProject(identity.rawToken);
    const resource = await createResource(identity.rawToken, project.id, SCRIPT_FILE);
    const capability = await createCapability(identity.rawToken, project.id, resource.id);

    const disabled = await readJson<CapabilityItemBody>(
      await apiFetch(`/api/v1/projects/${project.id}/capabilities/${capability.id}/disable`, {
        method: "POST",
        token: identity.rawToken,
      }),
    );
    expect(disabled.data.enabled).toBe(false);

    const disabledAgain = await readJson<CapabilityItemBody>(
      await apiFetch(`/api/v1/projects/${project.id}/capabilities/${capability.id}/disable`, {
        method: "POST",
        token: identity.rawToken,
      }),
    );
    expect(disabledAgain.data.enabled).toBe(false);
    expect(disabledAgain.data.updatedAt).toBe(disabled.data.updatedAt);

    const enabled = await readJson<CapabilityItemBody>(
      await apiFetch(`/api/v1/projects/${project.id}/capabilities/${capability.id}/enable`, {
        method: "POST",
        token: identity.rawToken,
      }),
    );
    expect(enabled.data.enabled).toBe(true);

    const enabledAgain = await readJson<CapabilityItemBody>(
      await apiFetch(`/api/v1/projects/${project.id}/capabilities/${capability.id}/enable`, {
        method: "POST",
        token: identity.rawToken,
      }),
    );
    expect(enabledAgain.data.updatedAt).toBe(enabled.data.updatedAt);
  });
});

describe("Capability 不提供 hard delete", () => {
  it("DELETE 路由不存在，改用 enabled = false", async () => {
    const identity = await seedIdentity();
    const project = await createProject(identity.rawToken);
    const resource = await createResource(identity.rawToken, project.id, SCRIPT_FILE);
    const capability = await createCapability(identity.rawToken, project.id, resource.id);

    const response = await apiFetch(
      `/api/v1/projects/${project.id}/capabilities/${capability.id}`,
      { method: "DELETE", token: identity.rawToken },
    );
    expect(response.status).toBe(404);
  });
});

describe("Resource 双向引用保护", () => {
  it("被 enabled Capability 引用时删除 Resource 返回 409 RESOURCE_IN_USE", async () => {
    const identity = await seedIdentity();
    const project = await createProject(identity.rawToken);
    const resource = await createResource(identity.rawToken, project.id, SCRIPT_FILE);
    await createCapability(identity.rawToken, project.id, resource.id);

    const response = await apiFetch(
      `/api/v1/projects/${project.id}/resources/${resource.id}`,
      { method: "DELETE", token: identity.rawToken },
    );

    expect(response.status).toBe(409);
    expect((await readJson<ErrorBody>(response)).error.code).toBe("RESOURCE_IN_USE");
  });

  it("被 disabled Capability 引用时同样拒绝删除", async () => {
    const identity = await seedIdentity();
    const project = await createProject(identity.rawToken);
    const resource = await createResource(identity.rawToken, project.id, SCRIPT_FILE);
    const capability = await createCapability(identity.rawToken, project.id, resource.id);
    await apiFetch(`/api/v1/projects/${project.id}/capabilities/${capability.id}/disable`, {
      method: "POST",
      token: identity.rawToken,
    });

    const response = await apiFetch(
      `/api/v1/projects/${project.id}/resources/${resource.id}`,
      { method: "DELETE", token: identity.rawToken },
    );

    expect(response.status).toBe(409);
    expect((await readJson<ErrorBody>(response)).error.code).toBe("RESOURCE_IN_USE");
  });

  it("解除引用后可以删除", async () => {
    const identity = await seedIdentity();
    const project = await createProject(identity.rawToken);
    const scriptResource = await createResource(identity.rawToken, project.id, SCRIPT_FILE);
    const other = await createResource(identity.rawToken, project.id, SKILL_DIRECTORY);
    const capability = await createCapability(identity.rawToken, project.id, scriptResource.id);

    const blocked = await apiFetch(
      `/api/v1/projects/${project.id}/resources/${scriptResource.id}`,
      { method: "DELETE", token: identity.rawToken },
    );
    expect(blocked.status).toBe(409);

    // 把 Capability 改指向另一个兼容 Resource，原 Resource 即可删除。
    await apiFetch(`/api/v1/projects/${project.id}/capabilities/${capability.id}`, {
      method: "PATCH",
      token: identity.rawToken,
      body: { type: "skill", resource_id: other.id },
    });

    const response = await apiFetch(
      `/api/v1/projects/${project.id}/resources/${scriptResource.id}`,
      { method: "DELETE", token: identity.rawToken },
    );
    expect(response.status).toBe(204);
  });

  it("Resource.kind 不兼容修改返回 422 且 Resource 与 Capability 均不变", async () => {
    const identity = await seedIdentity();
    const project = await createProject(identity.rawToken);
    const resource = await createResource(identity.rawToken, project.id, SCRIPT_FILE);
    const capability = await createCapability(identity.rawToken, project.id, resource.id);

    const response = await apiFetch(
      `/api/v1/projects/${project.id}/resources/${resource.id}`,
      { method: "PATCH", token: identity.rawToken, body: { kind: "directory" } },
    );

    expect(response.status).toBe(422);
    expect((await readJson<ErrorBody>(response)).error.code).toBe(
      "INVALID_CAPABILITY_RESOURCE_KIND",
    );

    const resourceAfter = await readJson<{ data: { kind: string } }>(
      await apiFetch(`/api/v1/projects/${project.id}/resources/${resource.id}`, {
        token: identity.rawToken,
      }),
    );
    expect(resourceAfter.data.kind).toBe("file");

    const capabilityAfter = await readJson<CapabilityItemBody>(
      await apiFetch(`/api/v1/projects/${project.id}/capabilities/${capability.id}`, {
        token: identity.rawToken,
      }),
    );
    expect(capabilityAfter.data.type).toBe("script");
    expect(capabilityAfter.data.resourceId).toBe(resource.id);
  });

  it("多引用时逐一检查：任一 Capability 不兼容即整体拒绝", async () => {
    const identity = await seedIdentity();
    const project = await createProject(identity.rawToken);
    const resource = await createResource(identity.rawToken, project.id, SCRIPT_FILE);
    await createCapability(identity.rawToken, project.id, resource.id, { name: "A" });
    await createCapability(identity.rawToken, project.id, resource.id, { name: "B" });

    const response = await apiFetch(
      `/api/v1/projects/${project.id}/resources/${resource.id}`,
      { method: "PATCH", token: identity.rawToken, body: { kind: "directory" } },
    );
    expect(response.status).toBe(422);
  });

  it("无引用时兼容的 kind 修改可以成功", async () => {
    const identity = await seedIdentity();
    const project = await createProject(identity.rawToken);
    const resource = await createResource(identity.rawToken, project.id, SKILL_DIRECTORY);

    const response = await apiFetch(
      `/api/v1/projects/${project.id}/resources/${resource.id}`,
      { method: "PATCH", token: identity.rawToken, body: { name: "改名" } },
    );
    expect(response.status).toBe(200);
  });

  it("数据库外键禁止直接删除被引用的 Resource", async () => {
    const identity = await seedIdentity();
    const project = await createProject(identity.rawToken);
    const resource = await createResource(identity.rawToken, project.id, SCRIPT_FILE);
    await createCapability(identity.rawToken, project.id, resource.id);

    // 绕过 API 直接删除，验证 FK 是 RESTRICT 而不是 CASCADE / NO ACTION 放任。
    await expect(
      env.DB.prepare("DELETE FROM resources WHERE id = ?").bind(resource.id).run(),
    ).rejects.toThrow();

    const stillThere = await env.DB.prepare("SELECT id FROM resources WHERE id = ?")
      .bind(resource.id)
      .first<{ id: string }>();
    expect(stillThere?.id).toBe(resource.id);

    const capabilityCount = await env.DB.prepare(
      "SELECT COUNT(*) AS total FROM capabilities WHERE resource_id = ?",
    )
      .bind(resource.id)
      .first<{ total: number }>();
    expect(capabilityCount?.total).toBe(1);
  });
});
