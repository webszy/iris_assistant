import { SELF, env } from "cloudflare:test";

import { generateRawToken, hashToken } from "../src/lib/token";
import { nowEpochMs } from "../src/lib/time";

export interface SeededIdentity {
  userId: string;
  tokenId: string;
  rawToken: string;
  name: string;
}

export interface SeedOptions {
  name?: string;
  expiresAt?: number | null;
  revokedAt?: number | null;
}

/** 在本地 D1 直接插入一条用户 + 一条 Token（只存 SHA-256）。 */
export async function seedIdentity(options: SeedOptions = {}): Promise<SeededIdentity> {
  const now = nowEpochMs();
  const userId = crypto.randomUUID();
  const tokenId = crypto.randomUUID();
  const rawToken = generateRawToken();
  const tokenHash = await hashToken(rawToken);
  const name = options.name ?? "Iris Dev User";

  await env.DB.prepare(
    "INSERT INTO users (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)",
  )
    .bind(userId, name, now, now)
    .run();

  await env.DB.prepare(
    "INSERT INTO api_tokens (id, user_id, token_hash, name, created_at, expires_at, revoked_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(
      tokenId,
      userId,
      tokenHash,
      "test",
      now,
      options.expiresAt ?? null,
      options.revokedAt ?? null,
      null,
    )
    .run();

  return { userId, tokenId, rawToken, name };
}

export function bearerHeaders(rawToken: string): Record<string, string> {
  return { Authorization: `Bearer ${rawToken}` };
}

/** 读取 JSON 响应体，避免在断言处出现未说明的 any。 */
export async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

export const TEST_ORIGIN = "https://iris.test";

export interface ApiRequestOptions {
  method?: string;
  body?: unknown;
  token?: string;
  headers?: Record<string, string>;
}

/**
 * 通过真实 Worker 发起请求。传 token 时自动带上 Bearer 头，
 * 传 body 时自动序列化为 JSON 并设置 Content-Type。
 */
export function apiFetch(path: string, options: ApiRequestOptions = {}): Promise<Response> {
  const headers: Record<string, string> = { ...options.headers };
  if (options.token !== undefined) {
    headers["Authorization"] = `Bearer ${options.token}`;
  }
  let body: string | undefined;
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }
  return SELF.fetch(`${TEST_ORIGIN}${path}`, { method: options.method ?? "GET", headers, body });
}

export interface ProjectPayload {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  kind: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

/** 通过真实 API 创建 Project，避免测试直接写表绕过校验。 */
export async function createProject(
  rawToken: string,
  overrides: Record<string, unknown> = {},
): Promise<ProjectPayload> {
  const response = await apiFetch("/api/v1/projects", {
    method: "POST",
    token: rawToken,
    body: { name: "Iris", slug: `iris-${crypto.randomUUID().slice(0, 8)}`, ...overrides },
  });
  if (response.status !== 201) {
    throw new Error(`创建 Project 失败：${response.status} ${await response.text()}`);
  }
  const body = await readJson<{ data: ProjectPayload }>(response);
  return body.data;
}

export interface MilestonePayload {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  status: string;
  position: number;
  createdAt: string;
  updatedAt: string;
}

/** 通过真实 API 创建 Milestone。 */
export async function createMilestone(
  rawToken: string,
  projectId: string,
  overrides: Record<string, unknown> = {},
): Promise<MilestonePayload> {
  const response = await apiFetch(`/api/v1/projects/${projectId}/milestones`, {
    method: "POST",
    token: rawToken,
    body: { name: "v0.1", ...overrides },
  });
  if (response.status !== 201) {
    throw new Error(`创建 Milestone 失败：${response.status} ${await response.text()}`);
  }
  const body = await readJson<{ data: MilestonePayload }>(response);
  return body.data;
}

export interface TaskPayload {
  id: string;
  projectId: string;
  milestoneId: string | null;
  title: string;
  description: string | null;
  status: string;
  position: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

/** 通过真实 API 创建 Task。 */
export async function createTask(
  rawToken: string,
  projectId: string,
  overrides: Record<string, unknown> = {},
): Promise<TaskPayload> {
  const response = await apiFetch(`/api/v1/projects/${projectId}/tasks`, {
    method: "POST",
    token: rawToken,
    body: { title: "Implement Project Core", ...overrides },
  });
  if (response.status !== 201) {
    throw new Error(`创建 Task 失败：${response.status} ${await response.text()}`);
  }
  const body = await readJson<{ data: TaskPayload }>(response);
  return body.data;
}

export interface ResourcePayload {
  id: string;
  projectId: string;
  milestoneId: string | null;
  taskId: string | null;
  name: string;
  kind: string;
  role: string;
  repository: string | null;
  path: string | null;
  url: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 通过真实 API 创建 Resource metadata。 */
export async function createResource(
  rawToken: string,
  projectId: string,
  overrides: Record<string, unknown> = {},
): Promise<ResourcePayload> {
  const response = await apiFetch(`/api/v1/projects/${projectId}/resources`, {
    method: "POST",
    token: rawToken,
    body: {
      name: "Iris v0.1 PRD",
      kind: "file",
      role: "spec",
      repository: "OPC_OS",
      path: "docs/prd.md",
      ...overrides,
    },
  });
  if (response.status !== 201) {
    throw new Error(`创建 Resource 失败：${response.status} ${await response.text()}`);
  }
  const body = await readJson<{ data: ResourcePayload }>(response);
  return body.data;
}

export interface CapabilityPayload {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  type: string;
  resourceId: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

/** 通过真实 API 注册 Capability。 */
export async function createCapability(
  rawToken: string,
  projectId: string,
  resourceId: string,
  overrides: Record<string, unknown> = {},
): Promise<CapabilityPayload> {
  const response = await apiFetch(`/api/v1/projects/${projectId}/capabilities`, {
    method: "POST",
    token: rawToken,
    body: { name: "Check Provider Health", type: "script", resource_id: resourceId, ...overrides },
  });
  if (response.status !== 201) {
    throw new Error(`注册 Capability 失败：${response.status} ${await response.text()}`);
  }
  const body = await readJson<{ data: CapabilityPayload }>(response);
  return body.data;
}
