import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app";
import { MAX_MARKDOWN_CONTENT_BYTES } from "../src/lib/markdown-content";
import type { Env } from "../src/types/env";
import { apiFetch, createMilestone, createProject, createResource, createTask, readJson, seedIdentity, type ResourcePayload } from "./helpers";
import { githubFixture, githubTestEnv, gitBlob } from "./github-content-fixture";

interface Content { resourceId: string; repository: string; path: string; contentType: string; content?: string; revision: string; sizeBytes: number }
interface Created { data: { resource: ResourcePayload; content: Content } }

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

async function fixture() {
  const identity = await seedIdentity();
  const project = await createProject(identity.rawToken);
  const github = githubFixture();
  vi.stubGlobal("fetch", github.fetcher);
  const app = createApp();
  const root = `/api/v1/projects/${project.id}/resources`;
  const runtime: Env = { DB: env.DB, ...githubTestEnv };
  const logs = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const request = (method: string, url: string, body?: unknown, token: string | null = identity.rawToken, bindings = runtime) => Promise.resolve(app.request(url, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  }, bindings));
  const create = (body: Record<string, unknown> = {}, bindings = runtime) => request("POST", `${root}/markdown`, {
    name: "PRD", path: "specs/prd.md", role: "spec", content: "# 中文 😀\r\n", ...body,
  }, identity.rawToken, bindings);
  const registered = (overrides: Record<string, unknown> = {}) => createResource(identity.rawToken, project.id, {
    repository: "iris-memory", path: `projects/${project.id}/specs/prd.md`, ...overrides,
  });
  return { identity, project, github, root, runtime, logs, request, create, registered };
}

async function error(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(await response.json()).toMatchObject({ success: false, error: { code } });
}

/** Fault injection around real D1 operations, not a mock database or fabricated SQL result. */
function failingInsert(mode: "before" | "after" | "unreadable"): D1Database {
  let attempted = false;
  function wrap(statement: D1PreparedStatement, sql: string): D1PreparedStatement {
    return new Proxy(statement, {
      get(target, property) {
        if (property === "bind") return (...values: unknown[]) => wrap(target.bind(...values), sql);
        const value = Reflect.get(target, property, target);
        if (typeof value !== "function") return value;
        if (["run", "all", "raw", "first"].includes(String(property))) return async (...args: unknown[]) => {
          if (/^insert into "resources"/i.test(sql)) {
            attempted = true;
            if (mode === "after") await Reflect.apply(value, target, args);
            throw new Error("private SQL/token detail must not escape");
          }
          if (mode === "unreadable" && attempted && /from "resources"/i.test(sql)) throw new Error("D1 unavailable");
          return Reflect.apply(value, target, args);
        };
        return value.bind(target);
      },
    });
  }
  return new Proxy(env.DB, {
    get(target, property) {
      if (property === "prepare") return (sql: string) => wrap(target.prepare(sql), sql);
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

describe("Markdown Resource API", () => {
  it("creates, reads, updates full UTF-8 text; preserves metadata and hides physical provider details", async () => {
    const f = await fixture();
    const response = await f.create();
    expect(response.status).toBe(201);
    const created = await readJson<Created>(response);
    const { resource, content } = created.data;
    expect(resource).toMatchObject({ projectId: f.project.id, kind: "file", repository: "iris-memory", path: `projects/${f.project.id}/specs/prd.md`, milestoneId: null, taskId: null });
    expect(content).toMatchObject({ resourceId: resource.id, contentType: "text/markdown", sizeBytes: new TextEncoder().encode("# 中文 😀\r\n").length });
    expect(content).not.toHaveProperty("content");
    expect(content).not.toHaveProperty("sha");
    const url = `${f.root}/${resource.id}/content`;
    const read = await f.request("GET", url);
    expect(read.status).toBe(200);
    expect(await read.json()).toMatchObject({ data: { content: "# 中文 😀\r\n", revision: content.revision } });
    const updated = await f.request("PUT", url, { content: "\uFEFF# new\r\n", expected_revision: content.revision });
    expect(updated.status).toBe(200);
    const result = await readJson<{ data: Content }>(updated);
    expect(result.data.revision).not.toBe(content.revision);
    expect(await (await f.request("GET", url)).json()).toMatchObject({ data: { content: "\uFEFF# new\r\n", revision: result.data.revision } });
    const metadata = await f.request("GET", `${f.root}/${resource.id}`);
    expect((await readJson<{ data: ResourcePayload }>(metadata)).data).toEqual(resource);
    expect(JSON.stringify(result)).not.toMatch(/fake-github-secret|test-owner|test-memory|"sha"/);
    expect((await env.DB.prepare("SELECT * FROM resources WHERE id = ?").bind(resource.id).first())).not.toHaveProperty("content");
  });

  it.each(["skills/foo.md", ".identity/foo.md", "projects/other/foo.md", "README.md", "notes/design.markdown"])("allows project-local directory names: %s", async path => {
    const f = await fixture();
    const response = await f.create({ path, content: "" });
    expect(response.status).toBe(201);
    expect((await readJson<Created>(response)).data.content.sizeBytes).toBe(0);
    expect(f.github.files.has(`projects/${f.project.id}/${path}`)).toBe(true);
  });

  it.each(["/a.md", "../a.md", "foo/../../a.md", "foo/./a.md", "foo//a.md", "foo/", "foo\\a.md", "foo\0a.md", "a.txt", "a.MD", "C:/a.md"])("rejects noncanonical/non-Markdown paths before contacting Git: %s", async path => {
    const f = await fixture();
    await error(await f.create({ path }), 422, "INVALID_RESOURCE_LOCATION");
    expect(f.github.requests).toHaveLength(0);
  });

  it("rejects empty paths, forbidden client fields and missing expected_revision", async () => {
    const f = await fixture();
    await error(await f.create({ path: "" }), 400, "BAD_REQUEST");
    for (const field of ["kind", "repository", "project_id", "user_id", "branch", "owner"]) {
      await error(await f.create({ [field]: "injected" }), 400, "BAD_REQUEST");
    }
    const resource = await f.registered();
    await error(await f.request("PUT", `${f.root}/${resource.id}/content`, { content: "new" }), 400, "BAD_REQUEST");
    await error(await f.request("PUT", `${f.root}/${resource.id}/content`, { content: "new", expected_revision: "x", path: "other.md" }), 400, "BAD_REQUEST");
    expect(f.github.requests).toHaveLength(0);
  });

  it("uses UTF-8 bytes for CREATE/UPDATE limits and permits exactly 5 MiB", async () => {
    const f = await fixture();
    const oversized = "中".repeat(Math.floor(MAX_MARKDOWN_CONTENT_BYTES / 3) + 1);
    expect(oversized.length).toBeLessThan(MAX_MARKDOWN_CONTENT_BYTES);
    await error(await f.create({ content: oversized }), 413, "CONTENT_TOO_LARGE");
    const response = await f.create({ content: "x".repeat(MAX_MARKDOWN_CONTENT_BYTES) });
    expect(response.status).toBe(201);
    const { resource, content } = (await readJson<Created>(response)).data;
    const before = f.github.requests.length;
    await error(await f.request("PUT", `${f.root}/${resource.id}/content`, { content: oversized, expected_revision: content.revision }), 413, "CONTENT_TOO_LARGE");
    expect(f.github.requests).toHaveLength(before);
    expect(await (await f.request("GET", `${f.root}/${resource.id}/content`)).json()).toMatchObject({ data: { sizeBytes: MAX_MARKDOWN_CONTENT_BYTES } });
  });

  it("READ rejects a remote file larger than 5 MiB", async () => {
    const f = await fixture();
    const resource = await f.registered();
    await f.github.put(resource.path!, "x".repeat(MAX_MARKDOWN_CONTENT_BYTES + 1));
    await error(await f.request("GET", `${f.root}/${resource.id}/content`), 413, "CONTENT_TOO_LARGE");
  });

  it("reuses milestone/task validation, including mutual exclusion and Project/user ownership", async () => {
    const f = await fixture();
    const milestone = await createMilestone(f.identity.rawToken, f.project.id);
    const task = await createTask(f.identity.rawToken, f.project.id, { milestone_id: milestone.id });
    await error(await f.create({ milestone_id: milestone.id, task_id: task.id }), 422, "INVALID_RESOURCE_SCOPE");
    const other = await seedIdentity();
    const otherProject = await createProject(other.rawToken);
    const foreignMilestone = await createMilestone(other.rawToken, otherProject.id);
    const secondProject = await createProject(f.identity.rawToken);
    const foreignTask = await createTask(f.identity.rawToken, secondProject.id);
    await error(await f.create({ milestone_id: foreignMilestone.id }), 404, "MILESTONE_NOT_FOUND");
    await error(await f.create({ task_id: foreignTask.id }), 404, "TASK_NOT_FOUND");
    expect(f.github.requests).toHaveLength(0);
    const a = await f.create({ milestone_id: milestone.id });
    expect(a.status).toBe(201);
    expect((await readJson<Created>(a)).data.resource.milestoneId).toBe(milestone.id);
    const b = await f.create({ path: "task.md", task_id: task.id });
    expect(b.status).toBe(201);
    expect((await readJson<Created>(b)).data.resource).toMatchObject({ taskId: task.id, milestoneId: null });
  });

  it("Git existence wins: existing pointer + absent file can CREATE; existing file cannot", async () => {
    const f = await fixture();
    await f.registered();
    const response = await f.create();
    expect(response.status).toBe(201);
    const created = (await readJson<Created>(response)).data.resource;
    await error(await f.create(), 409, "CONTENT_ALREADY_EXISTS");
    const second = await f.registered({ role: "reference" });
    const a = await readJson<{ data: Content }>(await f.request("GET", `${f.root}/${created.id}/content`));
    const b = await readJson<{ data: Content }>(await f.request("GET", `${f.root}/${second.id}/content`));
    expect(a.data.revision).toBe(b.data.revision);
    expect((await f.request("DELETE", `${f.root}/${created.id}`)).status).toBe(204);
    expect(f.github.files.has(created.path!)).toBe(true);
    await error(await f.create(), 409, "CONTENT_ALREADY_EXISTS");
  });

  it("Project slug edits and identical slugs across users cannot change/share physical namespaces", async () => {
    const f = await fixture();
    const first = (await readJson<Created>(await f.create())).data.resource;
    const changed = await apiFetch(`/api/v1/projects/${f.project.id}`, { method: "PATCH", token: f.identity.rawToken, body: { slug: "changed-slug" } });
    expect(changed.status).toBe(200);
    expect((await f.request("GET", `${f.root}/${first.id}/content`)).status).toBe(200);
    const other = await seedIdentity();
    const project = await createProject(other.rawToken, { slug: "changed-slug" });
    const response = await f.request("POST", `/api/v1/projects/${project.id}/resources/markdown`, { name: "Other", path: "specs/prd.md", role: "spec", content: "other" }, other.rawToken);
    expect(response.status).toBe(201);
    expect((await readJson<Created>(response)).data.resource.path).not.toBe(first.path);
  });

  it("PATCH rebinds metadata only and missing targets return CONTENT_NOT_FOUND for GET/PUT", async () => {
    const f = await fixture();
    const { resource, content } = (await readJson<Created>(await f.create())).data;
    const newPath = `projects/${f.project.id}/missing.md`;
    const before = f.github.requests.length;
    expect((await f.request("PATCH", `${f.root}/${resource.id}`, { path: newPath })).status).toBe(200);
    expect(f.github.requests).toHaveLength(before);
    expect(f.github.files.has(resource.path!)).toBe(true);
    await error(await f.request("GET", `${f.root}/${resource.id}/content`), 404, "CONTENT_NOT_FOUND");
    await error(await f.request("PUT", `${f.root}/${resource.id}/content`, { content: "new", expected_revision: content.revision }), 404, "CONTENT_NOT_FOUND");
  });

  it.each([
    { kind: "directory" }, { kind: "repository" }, { kind: "url", url: "https://example.test" },
    { repository: "other" }, { path: "projects/other/file.md" }, { path: "skills/root.md" },
    { path: "file.ts" },
  ])("rejects unsupported resources for READ and UPDATE (%#)", async overrides => {
    const f = await fixture();
    const resource = await f.registered(overrides);
    await error(await f.request("GET", `${f.root}/${resource.id}/content`), 422, "RESOURCE_CONTENT_UNSUPPORTED");
    await error(await f.request("PUT", `${f.root}/${resource.id}/content`, { content: "x", expected_revision: "x" }), 422, "RESOURCE_CONTENT_UNSUPPORTED");
    expect(f.github.requests).toHaveLength(0);
  });

  it("rejects unsafe historical DB pointers, including sibling-prefix and dot-segment paths", async () => {
    const f = await fixture();
    for (const path of [`projects/${f.project.id}-other/a.md`, `projects/${f.project.id}/../other/a.md`, `projects/${f.project.id}//a.md`, `projects/${f.project.id}/script.ts`]) {
      const resource = await f.registered({ path });
      await error(await f.request("GET", `${f.root}/${resource.id}/content`), 422, "RESOURCE_CONTENT_UNSUPPORTED");
    }
    expect(f.github.requests).toHaveLength(0);
  });

  it("requires Bearer auth and rejects cross-user/cross-Project Resources without contacting GitHub", async () => {
    const f = await fixture();
    const resource = await f.registered();
    const url = `${f.root}/${resource.id}/content`;
    for (const token of [null, "invalid", `iris_${"a".repeat(43)}`]) {
      await error(await f.request("GET", url, undefined, token), 401, "UNAUTHORIZED");
      await error(await f.request("PUT", url, { content: "x", expected_revision: "x" }, token), 401, "UNAUTHORIZED");
      await error(await f.request("POST", `${f.root}/markdown`, { name: "x", path: "x.md", role: "spec", content: "x" }, token), 401, "UNAUTHORIZED");
    }
    const other = await seedIdentity();
    await error(await f.request("GET", url, undefined, other.rawToken), 404, "PROJECT_NOT_FOUND");
    await error(await f.request("PUT", url, { content: "x", expected_revision: "x" }, other.rawToken), 404, "PROJECT_NOT_FOUND");
    const second = await createProject(f.identity.rawToken);
    for (const method of ["GET", "PUT"]) {
      const body = method === "PUT" ? { content: "x", expected_revision: "x" } : undefined;
      await error(await f.request(method, `/api/v1/projects/${second.id}/resources/${resource.id}/content`, body), 404, "RESOURCE_NOT_FOUND");
      await error(await f.request(method, `${f.root}/missing/content`, body), 404, "RESOURCE_NOT_FOUND");
    }
    expect(f.github.requests).toHaveLength(0);
  });

  it("stale PUT cannot overwrite and content DELETE is not exposed", async () => {
    const f = await fixture();
    const { resource, content } = (await readJson<Created>(await f.create())).data;
    await f.github.put(resource.path!, "concurrent edit");
    await error(await f.request("PUT", `${f.root}/${resource.id}/content`, { content: "wrong", expected_revision: content.revision }), 409, "CONTENT_CONFLICT");
    expect(f.github.files.get(resource.path!)?.content).toBe("concurrent edit");
    expect((await f.request("DELETE", `${f.root}/${resource.id}/content`)).status).toBe(404);
    expect(f.github.requests.some(r => r.method === "DELETE")).toBe(false);
  });

  it("validates Unicode commit messages and truncates default messages without changing names", async () => {
    const f = await fixture();
    await error(await f.create({ commit_message: "   " }), 400, "BAD_REQUEST");
    await error(await f.create({ commit_message: "😀".repeat(201) }), 400, "BAD_REQUEST");
    expect((await f.create({ commit_message: `  ${"😀".repeat(200)}  ` })).status).toBe(201);
    expect(f.github.requests.find(r => r.method === "PUT")?.body.message).toBe("😀".repeat(200));
    const name = "😀".repeat(250);
    const response = await f.create({ name, path: "long-name.md" });
    const { resource, content } = (await readJson<Created>(response)).data;
    expect(resource.name).toBe(name);
    await f.request("PUT", `${f.root}/${resource.id}/content`, { content: "new", expected_revision: content.revision });
    const messages = f.github.requests.filter(r => r.method === "PUT").slice(1).map(r => String(r.body.message));
    expect(messages.map(m => Array.from(m).length)).toEqual([200, 200]);
    expect(messages[0]?.startsWith("Add ")).toBe(true);
    expect(messages[1]?.startsWith("Update ")).toBe(true);
  });

  it("missing config produces a safe provider error, while metadata APIs still work", async () => {
    const f = await fixture();
    await error(await f.create({}, { DB: env.DB }), 502, "CONTENT_PROVIDER_ERROR");
    expect((await f.request("GET", f.root, undefined, f.identity.rawToken, { DB: env.DB })).status).toBe(200);
    expect(f.github.requests).toHaveLength(0);
  });

  it.each(["read", "update", "create"])("provider failure during %s leaves metadata unchanged and logs no secrets/body", async operation => {
    const f = await fixture();
    const resource = await f.registered();
    f.github.hooks.intercept = async () => new Response("fake-github-secret private upstream body", { status: 503 });
    const response = operation === "create" ? await f.create() : await f.request(operation === "read" ? "GET" : "PUT", `${f.root}/${resource.id}/content`, operation === "read" ? undefined : { content: "private Markdown", expected_revision: "x" });
    await error(response, 502, "CONTENT_PROVIDER_ERROR");
    const rows = await env.DB.prepare("SELECT id FROM resources WHERE project_id = ?").bind(f.project.id).all();
    expect(rows.results).toHaveLength(1);
    expect((await readJson<{ data: ResourcePayload }>(await f.request("GET", `${f.root}/${resource.id}`))).data).toEqual(resource);
    const log = JSON.stringify(f.logs.mock.calls);
    expect(log).toContain(f.project.id);
    expect(log).not.toMatch(/fake-github-secret|private Markdown|private upstream body|Authorization/);
    expect(log).not.toContain(f.identity.rawToken);
  });

  it("unknown Git CREATE never inserts D1 or compensates blindly", async () => {
    const f = await fixture();
    f.github.hooks.intercept = async request => {
      if (request.method === "PUT") {
        await f.github.put(`projects/${f.project.id}/specs/prd.md`, "actually written");
        throw new Error("lost write result");
      }
      return undefined;
    };
    await error(await f.create(), 502, "CONTENT_PROVIDER_ERROR");
    expect((await env.DB.prepare("SELECT id FROM resources WHERE project_id = ?").bind(f.project.id).all()).results).toHaveLength(0);
    expect(f.github.requests.filter(r => r.method !== "GET").map(r => r.method)).toEqual(["PUT"]);
    expect(f.github.files.size).toBe(1);
  });

  it("confirmed Git CREATE rejection leaves no D1 row and performs no compensation", async () => {
    const f = await fixture();
    f.github.hooks.intercept = async request => request.method === "PUT"
      ? new Response("private permission response", { status: 403 }) : undefined;
    await error(await f.create(), 502, "CONTENT_PROVIDER_ERROR");
    expect((await env.DB.prepare("SELECT id FROM resources WHERE project_id = ?").bind(f.project.id).all()).results).toHaveLength(0);
    expect(f.github.requests.filter(r => r.method !== "GET").map(r => r.method)).toEqual(["PUT"]);
    expect(f.github.files.size).toBe(0);
    expect(JSON.stringify(f.logs.mock.calls)).not.toContain("private permission response");
  });

  it("confirmed absent D1 row triggers rollback with precisely the newly created revision", async () => {
    const f = await fixture();
    await error(await f.create({}, { ...f.runtime, DB: failingInsert("before") }), 500, "INTERNAL_ERROR");
    const rollback = f.github.requests.find(r => r.method === "DELETE");
    expect(rollback?.body.sha).toBe(await gitBlob("# 中文 😀\r\n"));
    expect(rollback?.body.message).toBe("Rollback failed Iris Resource creation");
    expect(f.github.files.size).toBe(0);
    expect(JSON.stringify(f.logs.mock.calls)).toContain("content_create_rolled_back");
  });

  it("D1 insert succeeded but result was lost: read back the preallocated ID and return success", async () => {
    const f = await fixture();
    const response = await f.create({}, { ...f.runtime, DB: failingInsert("after") });
    expect(response.status).toBe(201);
    const { resource } = (await readJson<Created>(response)).data;
    expect(await env.DB.prepare("SELECT id FROM resources WHERE id = ?").bind(resource.id).first()).toEqual({ id: resource.id });
    expect(f.github.requests.some(r => r.method === "DELETE")).toBe(false);
  });

  it("unreadable D1 outcome leaves Git intact and logs repair context", async () => {
    const f = await fixture();
    await error(await f.create({}, { ...f.runtime, DB: failingInsert("unreadable") }), 500, "INTERNAL_ERROR");
    expect(f.github.files.size).toBe(1);
    expect(f.github.requests.some(r => r.method === "DELETE")).toBe(false);
    expect(JSON.stringify(f.logs.mock.calls)).toContain("content_create_d1_outcome_unknown");
  });

  it("rollback cannot erase a concurrent edit; failure logs repair context and returns 500", async () => {
    const f = await fixture();
    f.github.hooks.intercept = async request => {
      if (request.method === "DELETE") await f.github.put(`projects/${f.project.id}/specs/prd.md`, "concurrent edit");
      return undefined;
    };
    await error(await f.create({}, { ...f.runtime, DB: failingInsert("before") }), 500, "INTERNAL_ERROR");
    expect(f.github.files.get(`projects/${f.project.id}/specs/prd.md`)?.content).toBe("concurrent edit");
    const log = JSON.stringify(f.logs.mock.calls);
    expect(log).toContain("content_create_rollback_failed");
    expect(log).not.toMatch(/fake-github-secret|private SQL|concurrent edit/);
  });

  it("OpenAPI source exposes all endpoints, Bearer auth, strict request fields and errors", async () => {
    const response = await createApp().request("/openapi.json");
    const doc = await response.json() as { paths: Record<string, Record<string, { security: unknown; responses: Record<string, unknown> }>>; components: { schemas: Record<string, { required?: string[]; additionalProperties?: boolean }> } };
    const create = doc.paths["/api/v1/projects/{projectId}/resources/markdown"]?.post;
    const content = doc.paths["/api/v1/projects/{projectId}/resources/{resourceId}/content"];
    expect(create?.security).toEqual([{ bearerAuth: [] }]);
    expect(create?.responses).toHaveProperty("201");
    for (const operation of [create, content?.get, content?.put]) {
      for (const status of [401, 404, 413, 422, 500, 502]) expect(operation?.responses).toHaveProperty(String(status));
    }
    expect(content?.put?.responses).toHaveProperty("409");
    expect(content).not.toHaveProperty("delete");
    expect(doc.components.schemas.CreateMarkdownResourceRequest?.additionalProperties).toBe(false);
    expect(doc.components.schemas.UpdateResourceContentRequest?.required).toContain("expected_revision");
  });
});
