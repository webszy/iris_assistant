import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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

/** Finance settings are explicit; users.default_currency is not a fallback. */
export const financeSettings = sqliteTable("finance_settings", {
  userId: text("user_id").primaryKey().notNull().references(() => users.id),
  reportingCurrency: text("reporting_currency").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [
  check("finance_settings_currency_check", sql`length(${table.reportingCurrency}) = 3 AND ${table.reportingCurrency} NOT GLOB '*[^A-Z]*'`),
]);

/** Global current cache. Direction: 1 base = rate quote; not a historical table. */
export const exchangeRates = sqliteTable("exchange_rates", {
  baseCurrency: text("base_currency").notNull(),
  quoteCurrency: text("quote_currency").notNull(),
  rateScaled: integer("rate_scaled").notNull(),
  source: text("source").notNull(),
  rateDate: text("rate_date").notNull(),
  fetchedAt: integer("fetched_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.baseCurrency, table.quoteCurrency] }),
  check("exchange_rates_base_check", sql`length(${table.baseCurrency}) = 3 AND ${table.baseCurrency} NOT GLOB '*[^A-Z]*'`),
  check("exchange_rates_quote_check", sql`length(${table.quoteCurrency}) = 3 AND ${table.quoteCurrency} NOT GLOB '*[^A-Z]*'`),
  check("exchange_rates_rate_check", sql`typeof(${table.rateScaled}) = 'integer' AND ${table.rateScaled} BETWEEN 1 AND 9007199254740991`),
]);

export const expenses = sqliteTable("expenses", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  projectId: text("project_id").notNull().references(() => projects.id),
  amountMinor: integer("amount_minor").notNull(),
  currency: text("currency").notNull(),
  reportingCurrency: text("reporting_currency").notNull(),
  exchangeRateScaled: integer("exchange_rate_scaled").notNull(),
  category: text("category"),
  description: text("description"),
  occurredAt: integer("occurred_at").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [
  index("expenses_user_id_project_id_occurred_at_idx").on(table.userId, table.projectId, table.occurredAt),
  check("expenses_amount_check", sql`typeof(${table.amountMinor}) = 'integer' AND ${table.amountMinor} BETWEEN 1 AND 9007199254740991`),
  check("expenses_rate_check", sql`typeof(${table.exchangeRateScaled}) = 'integer' AND ${table.exchangeRateScaled} BETWEEN 1 AND 9007199254740991`),
  check("expenses_currency_check", sql`length(${table.currency}) = 3 AND ${table.currency} NOT GLOB '*[^A-Z]*'`),
  check("expenses_reporting_currency_check", sql`length(${table.reportingCurrency}) = 3 AND ${table.reportingCurrency} NOT GLOB '*[^A-Z]*'`),
]);

export type FinanceSettingsRow = typeof financeSettings.$inferSelect;
export type ExchangeRateRow = typeof exchangeRates.$inferSelect;
export type ExpenseRow = typeof expenses.$inferSelect;

/** Reminder definitions and immutable versioned logical occurrences. */
export const reminders = sqliteTable("reminders", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  projectId: text("project_id").references(() => projects.id),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status", { enum: ["active", "completed", "cancelled"] }).notNull().default("active"),
  startsAt: integer("starts_at").notNull(),
  timezone: text("timezone").notNull(),
  rrule: text("rrule"),
  scheduleVersion: integer("schedule_version").notNull().default(1),
  /** Internal CAS fence; every domain mutation replaces it in the same transaction. */
  mutationToken: text("mutation_token").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  completedAt: integer("completed_at"),
  cancelledAt: integer("cancelled_at"),
}, t => [
  index("reminders_user_status_idx").on(t.userId, t.status),
  check("reminders_status_check", sql`${t.status} IN ('active','completed','cancelled')`),
  check("reminders_version_check", sql`typeof(${t.scheduleVersion}) = 'integer' AND ${t.scheduleVersion} >= 1`),
]);

export const reminderOccurrences = sqliteTable("reminder_occurrences", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  reminderId: text("reminder_id").notNull().references(() => reminders.id),
  scheduleVersion: integer("schedule_version").notNull(),
  scheduledFor: integer("scheduled_for").notNull(),
  triggerAt: integer("trigger_at").notNull(),
  triggerVersion: integer("trigger_version").notNull().default(1),
  status: text("status", { enum: ["pending", "triggered", "done", "skipped", "cancelled"] }).notNull().default("pending"),
  triggerCount: integer("trigger_count").notNull().default(0),
  lastTriggeredAt: integer("last_triggered_at"),
  handledAt: integer("handled_at"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, t => [
  uniqueIndex("reminder_occurrences_logical_unique").on(t.reminderId, t.scheduleVersion, t.scheduledFor),
  index("reminder_occurrences_user_status_trigger_idx").on(t.userId, t.status, t.triggerAt),
  index("reminder_occurrences_reminder_status_idx").on(t.reminderId, t.status),
  // The scheduler queries all users; a user-leading index cannot serve that scan.
  index("reminder_occurrences_due_idx").on(t.triggerAt).where(sql`${t.status} = 'pending'`),
  check("reminder_occurrences_status_check", sql`${t.status} IN ('pending','triggered','done','skipped','cancelled')`),
  check("reminder_occurrences_versions_check", sql`typeof(${t.scheduleVersion}) = 'integer' AND ${t.scheduleVersion} >= 1 AND typeof(${t.triggerVersion}) = 'integer' AND ${t.triggerVersion} >= 1`),
  check("reminder_occurrences_count_check", sql`typeof(${t.triggerCount}) = 'integer' AND ${t.triggerCount} >= 0`),
]);
export type ReminderRow = typeof reminders.$inferSelect;
export type ReminderOccurrenceRow = typeof reminderOccurrences.$inferSelect;

/** Immutable accepted message snapshots. Execution state belongs to deliveries. */
export const notifications = sqliteTable("notifications", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  sourceType: text("source_type", { enum: ["reminder_occurrence"] }).notNull(),
  sourceId: text("source_id").notNull(),
  sourceVersion: integer("source_version").notNull(),
  dedupeKey: text("dedupe_key").notNull(),
  title: text("title").notNull(),
  body: text("body"),
  createdAt: integer("created_at").notNull(),
}, t => [
  uniqueIndex("notifications_user_dedupe_unique").on(t.userId, t.dedupeKey),
  uniqueIndex("notifications_id_user_unique").on(t.id, t.userId),
  index("notifications_user_created_idx").on(t.userId, t.createdAt),
  check("notifications_source_check", sql`${t.sourceType} = 'reminder_occurrence'`),
  check("notifications_version_check", sql`typeof(${t.sourceVersion})='integer' AND ${t.sourceVersion}>=1`),
]);
export const notificationSettings = sqliteTable("notification_settings", {
  userId: text("user_id").primaryKey().references(() => users.id),
  enabled: integer("enabled", { mode: "boolean" }).notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, t => [check("notification_settings_enabled_check", sql`${t.enabled} IN (0,1)`)]);
export const notificationChannels = sqliteTable("notification_channels", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  channel: text("channel").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull(),
  priority: integer("priority").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, t => [
  uniqueIndex("notification_channels_user_channel_unique").on(t.userId, t.channel),
  index("notification_channels_selection_idx").on(t.userId, t.enabled, t.priority),
  check("notification_channels_enabled_check", sql`${t.enabled} IN (0,1)`),
  check("notification_channels_priority_check", sql`typeof(${t.priority})='integer' AND ${t.priority}>=0 AND ${t.priority}<=2147483647`),
]);
export const notificationDeliveries = sqliteTable("notification_deliveries", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  notificationId: text("notification_id").notNull(),
  channel: text("channel").notNull(),
  status: text("status", { enum: ["pending", "sent", "failed"] }).notNull().default("pending"),
  attemptCount: integer("attempt_count").notNull().default(0),
  nextAttemptAt: integer("next_attempt_at"),
  lastAttemptAt: integer("last_attempt_at"),
  sentAt: integer("sent_at"),
  providerMessageId: text("provider_message_id"),
  lastErrorCode: text("last_error_code"),
  lastErrorMessage: text("last_error_message"),
  claimToken: text("claim_token"),
  claimExpiresAt: integer("claim_expires_at"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, t => [
  foreignKey({ columns: [t.notificationId, t.userId], foreignColumns: [notifications.id, notifications.userId] }),
  uniqueIndex("notification_deliveries_channel_unique").on(t.notificationId, t.channel),
  uniqueIndex("notification_deliveries_one_pending").on(t.notificationId).where(sql`${t.status}='pending'`),
  index("notification_deliveries_due_idx").on(t.status, t.nextAttemptAt),
  index("notification_deliveries_user_notification_idx").on(t.userId, t.notificationId),
  check("notification_deliveries_status_check", sql`${t.status} IN ('pending','sent','failed')`),
  check("notification_deliveries_count_check", sql`typeof(${t.attemptCount})='integer' AND ${t.attemptCount}>=0`),
  check("notification_deliveries_due_check", sql`(${t.status}='pending' AND ${t.nextAttemptAt} IS NOT NULL) OR (${t.status}<>'pending' AND ${t.nextAttemptAt} IS NULL)`),
  check("notification_deliveries_claim_check", sql`(${t.claimToken} IS NULL) = (${t.claimExpiresAt} IS NULL)`),
]);
export type NotificationRow = typeof notifications.$inferSelect;
export type NotificationDeliveryRow = typeof notificationDeliveries.$inferSelect;
