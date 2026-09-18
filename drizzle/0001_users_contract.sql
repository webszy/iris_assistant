-- 将已应用的开发版 users(email/display_name) 无损迁移到批准的数据契约。
-- 同时重建 api_tokens，以便在 SQLite 外键开启时安全替换父表。
CREATE TABLE `users_v2` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`timezone` text DEFAULT 'Asia/Shanghai' NOT NULL,
	`locale` text DEFAULT 'zh-CN' NOT NULL,
	`default_currency` text DEFAULT 'CNY' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `users_v2` (`id`, `name`, `timezone`, `locale`, `default_currency`, `created_at`, `updated_at`)
SELECT `id`, COALESCE(NULLIF(`display_name`, ''), `email`), 'Asia/Shanghai', 'zh-CN', 'CNY', `created_at`, `updated_at`
FROM `users`;
--> statement-breakpoint
CREATE TABLE `api_tokens_v2` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`name` text,
	`created_at` integer NOT NULL,
	`expires_at` integer,
	`revoked_at` integer,
	`last_used_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users_v2`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `api_tokens_v2` (`id`, `user_id`, `token_hash`, `name`, `created_at`, `expires_at`, `revoked_at`, `last_used_at`)
SELECT `id`, `user_id`, `token_hash`, `name`, `created_at`, `expires_at`, `revoked_at`, `last_used_at`
FROM `api_tokens`;
--> statement-breakpoint
DROP TABLE `api_tokens`;
--> statement-breakpoint
DROP TABLE `users`;
--> statement-breakpoint
ALTER TABLE `users_v2` RENAME TO `users`;
--> statement-breakpoint
ALTER TABLE `api_tokens_v2` RENAME TO `api_tokens`;
--> statement-breakpoint
CREATE UNIQUE INDEX `api_tokens_token_hash_unique` ON `api_tokens` (`token_hash`);
--> statement-breakpoint
CREATE INDEX `api_tokens_user_id_idx` ON `api_tokens` (`user_id`);
