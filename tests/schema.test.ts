import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { hashToken } from "../src/lib/token";
import { seedIdentity } from "./helpers";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;

describe("D1 schema 契约", () => {
  it("Finance Phase 1 后共 10 张业务表，且未新增其他表", async () => {
    // 过滤 SQLite 内部表（sqlite_*）、Cloudflare 内部表（_cf_*）与 wrangler 的迁移记录表。
    const { results } = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations' ORDER BY name",
    ).all<{ name: string }>();

    expect(results.map((row) => row.name)).toEqual([
      "api_tokens",
      "capabilities",
      "exchange_rates",
      "expenses",
      "finance_settings",
      "milestones",
      "projects",
      "resources",
      "tasks",
      "users",
    ]);
  });

  it("users 只包含批准的字段", async () => {
    const { results } = await env.DB.prepare("PRAGMA table_info(users)").all<{ name: string }>();

    expect(results.map((row) => row.name)).toEqual([
      "id",
      "name",
      "timezone",
      "locale",
      "default_currency",
      "created_at",
      "updated_at",
    ]);
  });

  it("api_tokens 具有指向 users 的外键与 token_hash 唯一索引", async () => {
    const table = await env.DB.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'api_tokens'",
    ).first<{ sql: string }>();
    expect(table?.sql).toMatch(/REFERENCES\s+["`]?users["`]?/i);

    const { results } = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'api_tokens' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    ).all<{ name: string }>();

    expect(results.map((row) => row.name)).toEqual([
      "api_tokens_token_hash_unique",
      "api_tokens_user_id_idx",
    ]);
  });
});

describe("持久化约定", () => {
  it("users.id 与 api_tokens.id 是 crypto.randomUUID() 生成的 UUID v4", async () => {
    const identity = await seedIdentity();
    expect(identity.userId).toMatch(UUID_V4);
    expect(identity.tokenId).toMatch(UUID_V4);

    const stored = await env.DB.prepare("SELECT id FROM users WHERE id = ?")
      .bind(identity.userId)
      .first<{ id: string }>();
    expect(stored?.id).toBe(identity.userId);
  });

  it("时间列保存 UTC Unix epoch milliseconds", async () => {
    const identity = await seedIdentity();

    const row = await env.DB.prepare(
      "SELECT created_at, updated_at FROM users WHERE id = ?",
    )
      .bind(identity.userId)
      .first<{ created_at: number; updated_at: number }>();

    expect(typeof row?.created_at).toBe("number");
    expect(Number.isInteger(row?.created_at)).toBe(true);
    expect(Math.abs(Date.now() - (row?.created_at ?? 0))).toBeLessThan(60_000);
    expect(row?.updated_at).toBe(row?.created_at);
  });

  it("users 使用已批准的字段与区域默认值", async () => {
    const identity = await seedIdentity();
    const row = await env.DB.prepare(
      "SELECT name, timezone, locale, default_currency FROM users WHERE id = ?",
    )
      .bind(identity.userId)
      .first<{
        name: string;
        timezone: string;
        locale: string;
        default_currency: string;
      }>();

    expect(row).toEqual({
      name: identity.name,
      timezone: "Asia/Shanghai",
      locale: "zh-CN",
      default_currency: "CNY",
    });
  });

  it("数据库只保存 Token 的 SHA-256，不保存原始 Token", async () => {
    const identity = await seedIdentity();
    const expectedHash = await hashToken(identity.rawToken);

    const { results } = await env.DB.prepare("SELECT token_hash FROM api_tokens").all<{
      token_hash: string;
    }>();
    const hashes = results.map((row) => row.token_hash);

    expect(hashes).not.toContain(identity.rawToken);
    expect(hashes).toContain(expectedHash);
    for (const hash of hashes) {
      expect(hash).toMatch(SHA256_HEX);
    }
  });

  it("生成的 Token 符合 iris_<43 字符 base64url> 格式", async () => {
    const identity = await seedIdentity();
    expect(identity.rawToken).toMatch(/^iris_[A-Za-z0-9_-]{43}$/);
  });
});

async function columnNames(table: string): Promise<string[]> {
  const { results } = await env.DB.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
  return results.map((row) => row.name);
}

async function indexNames(table: string): Promise<string[]> {
  const { results } = await env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = ? AND name NOT LIKE 'sqlite_%' ORDER BY name",
  )
    .bind(table)
    .all<{ name: string }>();
  return results.map((row) => row.name);
}

interface ForeignKeyRow {
  table: string;
  from: string;
  to: string;
  on_delete: string;
}

async function foreignKeys(table: string): Promise<ForeignKeyRow[]> {
  const { results } = await env.DB.prepare(`PRAGMA foreign_key_list(${table})`).all<ForeignKeyRow>();
  return results;
}

describe("Phase 2 五张业务表契约", () => {
  it("projects 字段、索引与外键符合批准规格", async () => {
    expect(await columnNames("projects")).toEqual([
      "id",
      "user_id",
      "name",
      "slug",
      "description",
      "kind",
      "status",
      "created_at",
      "updated_at",
      "archived_at",
    ]);
    expect(await indexNames("projects")).toEqual([
      "projects_user_id_archived_at_idx",
      "projects_user_id_slug_unique",
      "projects_user_id_status_idx",
    ]);
    expect(await foreignKeys("projects")).toEqual([
      expect.objectContaining({ table: "users", from: "user_id", to: "id" }),
    ]);
  });

  it("projects 不保存可从 Milestone / Task 派生的重复状态字段", async () => {
    const columns = await columnNames("projects");
    for (const forbidden of [
      "current_focus",
      "next_action",
      "progress",
      "current_milestone_id",
      "last_completed_task",
    ]) {
      expect(columns).not.toContain(forbidden);
    }
  });

  it("milestones 字段、索引与外键符合批准规格，且无截止日期字段", async () => {
    const columns = await columnNames("milestones");
    expect(columns).toEqual([
      "id",
      "user_id",
      "project_id",
      "name",
      "description",
      "status",
      "position",
      "created_at",
      "updated_at",
    ]);
    for (const forbidden of ["deadline", "due_at", "target_at", "completed_at"]) {
      expect(columns).not.toContain(forbidden);
    }
    expect(await indexNames("milestones")).toEqual([
      "milestones_user_id_project_id_idx",
      "milestones_user_id_project_id_position_idx",
      "milestones_user_id_project_id_status_idx",
    ]);
    expect((await foreignKeys("milestones")).map((row) => row.table).sort()).toEqual([
      "projects",
      "users",
    ]);
  });

  it("tasks 字段、索引与外键符合批准规格", async () => {
    expect(await columnNames("tasks")).toEqual([
      "id",
      "user_id",
      "project_id",
      "milestone_id",
      "title",
      "description",
      "status",
      "position",
      "created_at",
      "updated_at",
      "completed_at",
    ]);
    expect(await indexNames("tasks")).toEqual([
      "tasks_user_id_completed_at_idx",
      "tasks_user_id_milestone_id_position_idx",
      "tasks_user_id_milestone_id_status_idx",
      "tasks_user_id_project_id_idx",
      "tasks_user_id_project_id_position_idx",
      "tasks_user_id_project_id_status_idx",
    ]);
    expect((await foreignKeys("tasks")).map((row) => row.table).sort()).toEqual([
      "milestones",
      "projects",
      "users",
    ]);
  });

  it("resources 字段、索引与外键符合批准规格", async () => {
    expect(await columnNames("resources")).toEqual([
      "id",
      "user_id",
      "project_id",
      "milestone_id",
      "task_id",
      "name",
      "kind",
      "role",
      "repository",
      "path",
      "url",
      "created_at",
      "updated_at",
    ]);
    expect(await indexNames("resources")).toEqual([
      "resources_user_id_milestone_id_idx",
      "resources_user_id_project_id_idx",
      "resources_user_id_task_id_idx",
    ]);
    expect((await foreignKeys("resources")).map((row) => row.table).sort()).toEqual([
      "milestones",
      "projects",
      "tasks",
      "users",
    ]);
  });

  it("capabilities.resource_id 必填、非唯一，且外键为 RESTRICT 而非 CASCADE", async () => {
    expect(await columnNames("capabilities")).toEqual([
      "id",
      "user_id",
      "project_id",
      "name",
      "description",
      "type",
      "resource_id",
      "enabled",
      "created_at",
      "updated_at",
    ]);

    const columns = await env.DB.prepare("PRAGMA table_info(capabilities)").all<{
      name: string;
      notnull: number;
    }>();
    const resourceId = columns.results.find((row) => row.name === "resource_id");
    expect(resourceId?.notnull).toBe(1);

    // resource_id 上不能有唯一索引：同一个 Resource 允许多个 Capability。
    const { results: indexes } = await env.DB.prepare("PRAGMA index_list(capabilities)").all<{
      name: string;
      unique: number;
    }>();
    for (const index of indexes) {
      if (index.unique !== 1) continue;
      const { results: indexedColumns } = await env.DB.prepare(
        `PRAGMA index_info(${index.name})`,
      ).all<{ name: string }>();
      expect(indexedColumns.map((row) => row.name)).not.toEqual(["resource_id"]);
    }

    const capabilityForeignKeys = await foreignKeys("capabilities");
    const resourceForeignKey = capabilityForeignKeys.find((row) => row.table === "resources");
    expect(resourceForeignKey?.from).toBe("resource_id");
    expect(resourceForeignKey?.on_delete.toUpperCase()).toBe("RESTRICT");
    for (const row of capabilityForeignKeys) {
      expect(row.on_delete.toUpperCase()).not.toBe("CASCADE");
    }
  });

  it("capabilities 不包含 Capability Runtime 配置字段", async () => {
    const columns = await columnNames("capabilities");
    for (const forbidden of [
      "runtime",
      "entrypoint",
      "input_schema",
      "output_schema",
      "timeout",
      "permissions",
      "container",
      "environment",
      "dependencies",
      "execution_policy",
    ]) {
      expect(columns).not.toContain(forbidden);
    }
  });

  it("Phase 2 未改动 users / api_tokens 契约", async () => {
    expect(await columnNames("users")).toEqual([
      "id",
      "name",
      "timezone",
      "locale",
      "default_currency",
      "created_at",
      "updated_at",
    ]);
    expect(await columnNames("api_tokens")).toEqual([
      "id",
      "user_id",
      "token_hash",
      "name",
      "created_at",
      "expires_at",
      "revoked_at",
      "last_used_at",
    ]);
    expect(await indexNames("api_tokens")).toEqual([
      "api_tokens_token_hash_unique",
      "api_tokens_user_id_idx",
    ]);
  });
});
