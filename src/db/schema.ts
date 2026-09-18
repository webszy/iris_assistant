import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * Phase 1 建立 users / api_tokens。
 * Phase 2 建立 projects / milestones / tasks / resources / capabilities。
 * 所有 id 由 crypto.randomUUID() 生成（UUID v4，TEXT）。
 * 所有时间列为 UTC Unix epoch milliseconds（INTEGER）。
 */
export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    timezone: text("timezone").notNull().default("Asia/Shanghai"),
    locale: text("locale").notNull().default("zh-CN"),
    defaultCurrency: text("default_currency").notNull().default("CNY"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
);

export const apiTokens = sqliteTable(
  "api_tokens",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** 只保存 SHA-256 十六进制摘要，绝不保存原始 Token。 */
    tokenHash: text("token_hash").notNull(),
    name: text("name"),
    createdAt: integer("created_at").notNull(),
    expiresAt: integer("expires_at"),
    revokedAt: integer("revoked_at"),
    lastUsedAt: integer("last_used_at"),
  },
  (table) => [
    uniqueIndex("api_tokens_token_hash_unique").on(table.tokenHash),
    index("api_tokens_user_id_idx").on(table.userId),
  ],
);

/**
 * Project 是长期上下文；Milestone / Task / Resource / Capability 都必须落在 Project 内。
 * Project 不保存任何可从 Milestone / Task 派生的状态字段。
 */
export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    kind: text("kind").notNull().default("other"),
    status: text("status").notNull().default("planned"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    /** 归档与 status 分离：非 null 表示已归档，不引入 status = archived。 */
    archivedAt: integer("archived_at"),
  },
  (table) => [
    uniqueIndex("projects_user_id_slug_unique").on(table.userId, table.slug),
    index("projects_user_id_status_idx").on(table.userId, table.status),
    index("projects_user_id_archived_at_idx").on(table.userId, table.archivedAt),
  ],
);

export const milestones = sqliteTable(
  "milestones",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id),
    name: text("name").notNull(),
    description: text("description"),
    status: text("status").notNull().default("planned"),
    /** 规划顺序，按 Project 内 100 递增；不使用 created_at 推断顺序。 */
    position: integer("position").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("milestones_user_id_project_id_idx").on(table.userId, table.projectId),
    index("milestones_user_id_project_id_status_idx").on(table.userId, table.projectId, table.status),
    index("milestones_user_id_project_id_position_idx").on(
      table.userId,
      table.projectId,
      table.position,
    ),
  ],
);

export const tasks = sqliteTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id),
    /** 可空：Task 允许直接挂在 Project 下，不强制进入 Milestone。 */
    milestoneId: text("milestone_id").references(() => milestones.id),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status").notNull().default("todo"),
    /** 执行顺序，按 Milestone 内或 Project 级分组 100 递增。 */
    position: integer("position").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    completedAt: integer("completed_at"),
  },
  (table) => [
    index("tasks_user_id_project_id_idx").on(table.userId, table.projectId),
    index("tasks_user_id_project_id_status_idx").on(table.userId, table.projectId, table.status),
    index("tasks_user_id_project_id_position_idx").on(table.userId, table.projectId, table.position),
    index("tasks_user_id_milestone_id_status_idx").on(table.userId, table.milestoneId, table.status),
    index("tasks_user_id_milestone_id_position_idx").on(
      table.userId,
      table.milestoneId,
      table.position,
    ),
    index("tasks_user_id_completed_at_idx").on(table.userId, table.completedAt),
  ],
);

/**
 * Resource 只保存 metadata；Markdown 正文属于 Git，本阶段不读取、不修改。
 * 归属互斥：Project（两个子键都为空）/ Milestone / Task 三选一。
 */
export const resources = sqliteTable(
  "resources",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id),
    milestoneId: text("milestone_id").references(() => milestones.id),
    taskId: text("task_id").references(() => tasks.id),
    name: text("name").notNull(),
    kind: text("kind").notNull(),
    role: text("role").notNull(),
    repository: text("repository"),
    path: text("path"),
    url: text("url"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("resources_user_id_project_id_idx").on(table.userId, table.projectId),
    index("resources_user_id_milestone_id_idx").on(table.userId, table.milestoneId),
    index("resources_user_id_task_id_idx").on(table.userId, table.taskId),
  ],
);

/**
 * Capability 表示 Iris 可以利用某个 Resource 做什么，本身不保存 path / repository。
 * resource_id 必填且不唯一：同一个 Resource 可以暴露多个 Capability。
 * 外键使用 RESTRICT，禁止 CASCADE 删除，避免删除 Resource 时连带删除注册关系。
 */
export const capabilities = sqliteTable(
  "capabilities",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id),
    name: text("name").notNull(),
    description: text("description"),
    type: text("type").notNull(),
    resourceId: text("resource_id")
      .notNull()
      .references(() => resources.id, { onDelete: "restrict" }),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("capabilities_user_id_project_id_idx").on(table.userId, table.projectId),
    index("capabilities_user_id_project_id_enabled_idx").on(
      table.userId,
      table.projectId,
      table.enabled,
    ),
    index("capabilities_user_id_type_idx").on(table.userId, table.type),
    index("capabilities_user_id_resource_id_idx").on(table.userId, table.resourceId),
  ],
);

export type UserRow = typeof users.$inferSelect;
export type ApiTokenRow = typeof apiTokens.$inferSelect;
export type ProjectRow = typeof projects.$inferSelect;
export type MilestoneRow = typeof milestones.$inferSelect;
export type TaskRow = typeof tasks.$inferSelect;
export type ResourceRow = typeof resources.$inferSelect;
export type CapabilityRow = typeof capabilities.$inferSelect;
