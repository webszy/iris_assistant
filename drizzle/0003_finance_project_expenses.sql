-- Iris v0.2 Finance Phase 1: additive only; no v0.1 table/data changes.
CREATE TABLE `finance_settings` (
  `user_id` text PRIMARY KEY NOT NULL REFERENCES `users`(`id`),
  `reporting_currency` text NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  CONSTRAINT `finance_settings_currency_check` CHECK (length(`reporting_currency`) = 3 AND `reporting_currency` NOT GLOB '*[^A-Z]*')
);
--> statement-breakpoint
CREATE TABLE `exchange_rates` (
  `base_currency` text NOT NULL,
  `quote_currency` text NOT NULL,
  `rate_scaled` integer NOT NULL,
  `source` text NOT NULL,
  `rate_date` text NOT NULL,
  `fetched_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  PRIMARY KEY (`base_currency`, `quote_currency`),
  CONSTRAINT `exchange_rates_base_check` CHECK (length(`base_currency`) = 3 AND `base_currency` NOT GLOB '*[^A-Z]*'),
  CONSTRAINT `exchange_rates_quote_check` CHECK (length(`quote_currency`) = 3 AND `quote_currency` NOT GLOB '*[^A-Z]*'),
  CONSTRAINT `exchange_rates_rate_check` CHECK (typeof(`rate_scaled`) = 'integer' AND `rate_scaled` BETWEEN 1 AND 9007199254740991)
);
--> statement-breakpoint
CREATE TABLE `expenses` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`),
  `project_id` text NOT NULL REFERENCES `projects`(`id`),
  `amount_minor` integer NOT NULL,
  `currency` text NOT NULL,
  `reporting_currency` text NOT NULL,
  `exchange_rate_scaled` integer NOT NULL,
  `category` text,
  `description` text,
  `occurred_at` integer NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  CONSTRAINT `expenses_amount_check` CHECK (typeof(`amount_minor`) = 'integer' AND `amount_minor` BETWEEN 1 AND 9007199254740991),
  CONSTRAINT `expenses_rate_check` CHECK (typeof(`exchange_rate_scaled`) = 'integer' AND `exchange_rate_scaled` BETWEEN 1 AND 9007199254740991),
  CONSTRAINT `expenses_currency_check` CHECK (length(`currency`) = 3 AND `currency` NOT GLOB '*[^A-Z]*'),
  CONSTRAINT `expenses_reporting_currency_check` CHECK (length(`reporting_currency`) = 3 AND `reporting_currency` NOT GLOB '*[^A-Z]*')
);
--> statement-breakpoint
CREATE INDEX `expenses_user_id_project_id_occurred_at_idx` ON `expenses` (`user_id`, `project_id`, `occurred_at`);
