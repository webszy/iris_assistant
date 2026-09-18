import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app";
import {
  apiFetch,
  createCapability,
  createMilestone,
  createProject,
  createResource,
  createTask,
  readJson,
  seedIdentity,
  type CapabilityPayload,
  type ResourcePayload,
  type TaskPayload,
} from "./helpers";

/**
 * 在真实 D1 写入前让另一请求完成，固定合法的请求交错顺序。
 * batch 只能在整个事务开始前暂停，绝不伪造事务内可插入其他写入的行为。
 */
function pauseBeforeWrite(match: (sql: string) => boolean) {
  let reached!: () => void;
  let release!: () => void;
  const ready = new Promise<void>(resolve => { reached = resolve; });
  const resumed = new Promise<void>(resolve => { release = resolve; });
  const statements = new WeakMap<D1PreparedStatement, { original: D1PreparedStatement; sql: string }>();
  let paused = false;
  async function pause(sql: string) {
    if (!paused && match(sql)) {
      paused = true;
      reached();
      await resumed;
    }
  }
  function wrap(statement: D1PreparedStatement, sql: string): D1PreparedStatement {
    const wrapped = new Proxy(statement, {
      get(target, property) {
        if (property === "bind") {
          return (...values: unknown[]) => wrap(target.bind(...values), sql);
        }
        const value = Reflect.get(target, property, target);
        if (typeof value !== "function") return value;
        if (["run", "all", "raw", "first"].includes(String(property))) {
          return async (...args: unknown[]) => {
            await pause(sql);
            return Reflect.apply(value, target, args);
          };
        }
        return value.bind(target);
      },
    });
    statements.set(wrapped, { original: statement, sql });
    return wrapped;
  }
  const db = new Proxy(env.DB, {
    get(target, property) {
      if (property === "prepare") return (sql: string) => wrap(target.prepare(sql), sql);
      if (property === "batch") {
        return async (queries: D1PreparedStatement[]) => {
          for (const query of queries) {
            const details = statements.get(query);
            if (details) await pause(details.sql);
          }
          return target.batch(queries.map(query => statements.get(query)?.original ?? query));
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return { db, ready, release };
}

async function interleave(
  token: string,
  path: string,
  method: string,
  body: unknown,
  table: "resources" | "capabilities" | "tasks" | "projects",
  concurrentRequest: () => Promise<void>,
): Promise<Response> {
  const barrier = pauseBeforeWrite(sql => new RegExp(
    '^\\s*(?:insert into|update|delete from) "' + table + '"', "i",
  ).test(sql));
  const pending = Promise.resolve(createApp().request("https://iris.test" + path, {
    method,
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }, { DB: barrier.db }));

  try {
    // 写入路径消失或请求提前失败时立即报错，避免测试无意义地等到超时。
    await Promise.race([
      barrier.ready,
      pending.then(() => { throw new Error("请求没有到达预期的 D1 写入边界。"); }),
    ]);
    await concurrentRequest();
  } finally {
    barrier.release();
    await pending;
  }
  return pending;
}

async function expectError(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(await response.json()).toMatchObject({ success: false, error: { code } });
}

describe("并发请求保持业务不变量", () => {
  it.each([true, false])("Resource 改型不能越过并发注册的 Capability（enabled=%s）", async enabled => {
    const user = await seedIdentity();
    const project = await createProject(user.rawToken);
    const resource = await createResource(user.rawToken, project.id);
    const path = `/api/v1/projects/${project.id}/resources/${resource.id}`;
    const response = await interleave(user.rawToken, path, "PATCH", { kind: "directory" },
      "resources", async () => {
        await createCapability(user.rawToken, project.id, resource.id, { enabled });
      });
    await expectError(response, 422, "INVALID_CAPABILITY_RESOURCE_KIND");
    const final = await readJson<{ data: ResourcePayload }>(await apiFetch(path, { token: user.rawToken }));
    expect(final.data.kind).toBe("file");
  });

  it("Capability 注册按写入时的 Resource kind 校验", async () => {
    const user = await seedIdentity();
    const project = await createProject(user.rawToken);
    const resource = await createResource(user.rawToken, project.id);
    const collection = `/api/v1/projects/${project.id}/capabilities`;
    const response = await interleave(user.rawToken, collection, "POST",
      { name: "script", type: "script", resource_id: resource.id }, "capabilities", async () => {
        expect((await apiFetch(`/api/v1/projects/${project.id}/resources/${resource.id}`,
          { method: "PATCH", token: user.rawToken, body: { kind: "directory" } })).status).toBe(200);
      });
    await expectError(response, 422, "INVALID_CAPABILITY_RESOURCE_KIND");
    expect((await readJson<{ data: CapabilityPayload[] }>(
      await apiFetch(collection, { token: user.rawToken }),
    )).data).toEqual([]);
  });

  it("Capability 注册时 Resource 被删除，返回 404 而不是 FK 500", async () => {
    const user = await seedIdentity();
    const project = await createProject(user.rawToken);
    const resource = await createResource(user.rawToken, project.id);
    const response = await interleave(user.rawToken, `/api/v1/projects/${project.id}/capabilities`,
      "POST", { name: "script", type: "script", resource_id: resource.id },
      "capabilities", async () => {
        expect((await apiFetch(`/api/v1/projects/${project.id}/resources/${resource.id}`,
          { method: "DELETE", token: user.rawToken })).status).toBe(204);
      });
    await expectError(response, 404, "RESOURCE_NOT_FOUND");
  });

  it("Capability PATCH 不能指向并发改型后的 Resource", async () => {
    const user = await seedIdentity();
    const project = await createProject(user.rawToken);
    const first = await createResource(user.rawToken, project.id);
    const target = await createResource(user.rawToken, project.id);
    const capability = await createCapability(user.rawToken, project.id, first.id);
    const path = `/api/v1/projects/${project.id}/capabilities/${capability.id}`;
    const response = await interleave(user.rawToken, path, "PATCH", { resource_id: target.id },
      "capabilities", async () => {
        expect((await apiFetch(`/api/v1/projects/${project.id}/resources/${target.id}`,
          { method: "PATCH", token: user.rawToken, body: { kind: "directory" } })).status).toBe(200);
      });
    await expectError(response, 422, "INVALID_CAPABILITY_RESOURCE_KIND");
    const final = await readJson<{ data: CapabilityPayload }>(await apiFetch(path, { token: user.rawToken }));
    expect(final.data.resourceId).toBe(first.id);
  });

  it("Capability PATCH 使用当前 type 与新 resource_id 的组合", async () => {
    const user = await seedIdentity();
    const project = await createProject(user.rawToken);
    const file = await createResource(user.rawToken, project.id);
    const secondFile = await createResource(user.rawToken, project.id);
    const directory = await createResource(user.rawToken, project.id, { kind: "directory" });
    const capability = await createCapability(user.rawToken, project.id, file.id);
    const path = `/api/v1/projects/${project.id}/capabilities/${capability.id}`;
    const response = await interleave(user.rawToken, path, "PATCH", { resource_id: secondFile.id },
      "capabilities", async () => {
        expect((await apiFetch(path, { method: "PATCH", token: user.rawToken,
          body: { type: "skill", resource_id: directory.id } })).status).toBe(200);
      });
    await expectError(response, 422, "INVALID_CAPABILITY_RESOURCE_KIND");
    const final = await readJson<{ data: CapabilityPayload }>(await apiFetch(path, { token: user.rawToken }));
    expect(final.data).toMatchObject({ type: "skill", resourceId: directory.id });
  });

  it.each(["todo", "completed"] as const)("标题 PATCH 不覆盖从 %s 并发切换后的完成时间", async status => {
    const user = await seedIdentity();
    const project = await createProject(user.rawToken);
    const task = await createTask(user.rawToken, project.id, { status });
    const path = `/api/v1/projects/${project.id}/tasks/${task.id}`;
    const nextStatus = status === "todo" ? "completed" : "doing";
    let completedAt: string | null = null;
    const response = await interleave(user.rawToken, path, "PATCH", { title: "renamed" },
      "tasks", async () => {
        const result = await apiFetch(path, { method: "PATCH", token: user.rawToken,
          body: { status: nextStatus } });
        expect(result.status).toBe(200);
        completedAt = (await readJson<{ data: TaskPayload }>(result)).data.completedAt;
      });
    expect(response.status).toBe(200);
    const final = (await readJson<{ data: TaskPayload }>(response)).data;
    expect(final).toMatchObject({ title: "renamed", status: nextStatus, completedAt });
  });

  it("重复 completed PATCH 保留并发首次完成写入的时间", async () => {
    const user = await seedIdentity();
    const project = await createProject(user.rawToken);
    const task = await createTask(user.rawToken, project.id);
    const path = `/api/v1/projects/${project.id}/tasks/${task.id}`;
    let completedAt: string | null = null;
    const response = await interleave(user.rawToken, path, "PATCH", { status: "completed" },
      "tasks", async () => {
        // 确保第二个请求的时间与第一个已构造写入的 now 不同，避免同毫秒掩盖回归。
        await new Promise(resolve => setTimeout(resolve, 10));
        const result = await apiFetch(path, { method: "PATCH", token: user.rawToken,
          body: { status: "completed" } });
        expect(result.status).toBe(200);
        completedAt = (await readJson<{ data: TaskPayload }>(result)).data.completedAt;
      });
    expect(response.status).toBe(200);
    expect((await readJson<{ data: TaskPayload }>(response)).data.completedAt).toBe(completedAt);
  });

  it("Resource 名称 PATCH 保留并发更新的 path", async () => {
    const user = await seedIdentity();
    const project = await createProject(user.rawToken);
    const resource = await createResource(user.rawToken, project.id);
    const path = `/api/v1/projects/${project.id}/resources/${resource.id}`;
    const response = await interleave(user.rawToken, path, "PATCH", { name: "renamed" },
      "resources", async () => {
        expect((await apiFetch(path, { method: "PATCH", token: user.rawToken,
          body: { path: "new/location.md" } })).status).toBe(200);
      });
    expect(response.status).toBe(200);
    expect((await readJson<{ data: ResourcePayload }>(response)).data).toMatchObject({
      name: "renamed", path: "new/location.md",
    });
  });

  it("Resource kind PATCH 必须使用并发更新后的 location", async () => {
    const user = await seedIdentity();
    const project = await createProject(user.rawToken);
    const resource = await createResource(user.rawToken, project.id, {
      kind: "url", url: "https://example.com",
    });
    const path = `/api/v1/projects/${project.id}/resources/${resource.id}`;
    const response = await interleave(user.rawToken, path, "PATCH", { kind: "file" },
      "resources", async () => {
        expect((await apiFetch(path, { method: "PATCH", token: user.rawToken,
          body: { path: null } })).status).toBe(200);
      });
    await expectError(response, 422, "INVALID_RESOURCE_LOCATION");
    const final = await readJson<{ data: ResourcePayload }>(await apiFetch(path, { token: user.rawToken }));
    expect(final.data).toMatchObject({ kind: "url", path: null });
  });

  it("并发 Resource PATCH 不能组合出两个归属，也不能覆盖已完成的归属更新", async () => {
    const user = await seedIdentity();
    const project = await createProject(user.rawToken);
    const resource = await createResource(user.rawToken, project.id);
    const milestone = await createMilestone(user.rawToken, project.id);
    const task = await createTask(user.rawToken, project.id);
    const path = `/api/v1/projects/${project.id}/resources/${resource.id}`;
    const response = await interleave(user.rawToken, path, "PATCH", { milestone_id: milestone.id },
      "resources", async () => {
        expect((await apiFetch(path, { method: "PATCH", token: user.rawToken,
          body: { task_id: task.id } })).status).toBe(200);
      });
    await expectError(response, 422, "INVALID_RESOURCE_SCOPE");
    const final = await readJson<{ data: ResourcePayload }>(await apiFetch(path, { token: user.rawToken }));
    expect(final.data).toMatchObject({ milestoneId: null, taskId: task.id });
  });

  it("并发创建相同 slug 返回 409 SLUG_ALREADY_EXISTS", async () => {
    const user = await seedIdentity();
    const body = { name: "Iris", slug: "same-slug" };
    const response = await interleave(user.rawToken, "/api/v1/projects", "POST", body,
      "projects", async () => {
        expect((await apiFetch("/api/v1/projects", { method: "POST", token: user.rawToken, body })).status).toBe(201);
      });
    await expectError(response, 409, "SLUG_ALREADY_EXISTS");
  });

  it("并发修改相同 slug 返回 409 且不部分写入其他字段", async () => {
    const user = await seedIdentity();
    const project = await createProject(user.rawToken);
    const path = `/api/v1/projects/${project.id}`;
    const response = await interleave(user.rawToken, path, "PATCH",
      { name: "must-not-write", slug: "taken-during-patch" }, "projects", async () => {
        await createProject(user.rawToken, { slug: "taken-during-patch" });
      });
    await expectError(response, 409, "SLUG_ALREADY_EXISTS");
    expect((await readJson<{ data: { name: string; slug: string } }>(
      await apiFetch(path, { token: user.rawToken }),
    )).data).toMatchObject({ name: project.name, slug: project.slug });
  });

  it.each([true, false])("并发引用阻止 Resource 删除，返回 409（enabled=%s）", async enabled => {
    const user = await seedIdentity();
    const project = await createProject(user.rawToken);
    const resource = await createResource(user.rawToken, project.id);
    const path = `/api/v1/projects/${project.id}/resources/${resource.id}`;
    const response = await interleave(user.rawToken, path, "DELETE", undefined,
      "resources", async () => {
        await createCapability(user.rawToken, project.id, resource.id, { enabled });
      });
    await expectError(response, 409, "RESOURCE_IN_USE");
    expect((await apiFetch(path, { token: user.rawToken })).status).toBe(200);
  });
});
