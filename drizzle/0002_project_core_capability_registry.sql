-- Iris v0.1 Phase 2：Project Core + Capability Registry。
-- 只新增五张业务表及其索引/外键；不改写 0000_init.sql 与 0001_users_contract.sql，
-- 也不改动 users / api_tokens 的字段、数据与既有外键行为。
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`kind` text DEFAULT 'other' NOT NULL,
	`status` text DEFAULT 'planned' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`archived_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projects_user_id_slug_unique` ON `projects` (`user_id`,`slug`);--> statement-breakpoint
CREATE INDEX `projects_user_id_status_idx` ON `projects` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `projects_user_id_archived_at_idx` ON `projects` (`user_id`,`archived_at`);--> statement-breakpoint
CREATE TABLE `milestones` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'planned' NOT NULL,
	`position` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `milestones_user_id_project_id_idx` ON `milestones` (`user_id`,`project_id`);--> statement-breakpoint
CREATE INDEX `milestones_user_id_project_id_status_idx` ON `milestones` (`user_id`,`project_id`,`status`);--> statement-breakpoint
CREATE INDEX `milestones_user_id_project_id_position_idx` ON `milestones` (`user_id`,`project_id`,`position`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`milestone_id` text,
	`title` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'todo' NOT NULL,
	`position` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`milestone_id`) REFERENCES `milestones`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `tasks_user_id_project_id_idx` ON `tasks` (`user_id`,`project_id`);--> statement-breakpoint
CREATE INDEX `tasks_user_id_project_id_status_idx` ON `tasks` (`user_id`,`project_id`,`status`);--> statement-breakpoint
CREATE INDEX `tasks_user_id_project_id_position_idx` ON `tasks` (`user_id`,`project_id`,`position`);--> statement-breakpoint
CREATE INDEX `tasks_user_id_milestone_id_status_idx` ON `tasks` (`user_id`,`milestone_id`,`status`);--> statement-breakpoint
CREATE INDEX `tasks_user_id_milestone_id_position_idx` ON `tasks` (`user_id`,`milestone_id`,`position`);--> statement-breakpoint
CREATE INDEX `tasks_user_id_completed_at_idx` ON `tasks` (`user_id`,`completed_at`);--> statement-breakpoint
CREATE TABLE `resources` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`milestone_id` text,
	`task_id` text,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`role` text NOT NULL,
	`repository` text,
	`path` text,
	`url` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`milestone_id`) REFERENCES `milestones`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `resources_user_id_project_id_idx` ON `resources` (`user_id`,`project_id`);--> statement-breakpoint
CREATE INDEX `resources_user_id_milestone_id_idx` ON `resources` (`user_id`,`milestone_id`);--> statement-breakpoint
CREATE INDEX `resources_user_id_task_id_idx` ON `resources` (`user_id`,`task_id`);--> statement-breakpoint
CREATE TABLE `capabilities` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`type` text NOT NULL,
	`resource_id` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`resource_id`) REFERENCES `resources`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `capabilities_user_id_project_id_idx` ON `capabilities` (`user_id`,`project_id`);--> statement-breakpoint
CREATE INDEX `capabilities_user_id_project_id_enabled_idx` ON `capabilities` (`user_id`,`project_id`,`enabled`);--> statement-breakpoint
CREATE INDEX `capabilities_user_id_type_idx` ON `capabilities` (`user_id`,`type`);--> statement-breakpoint
CREATE INDEX `capabilities_user_id_resource_id_idx` ON `capabilities` (`user_id`,`resource_id`);
