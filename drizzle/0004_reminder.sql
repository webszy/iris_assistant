CREATE TABLE reminders (
 id TEXT PRIMARY KEY NOT NULL,
 user_id TEXT NOT NULL REFERENCES users(id),
 project_id TEXT REFERENCES projects(id),
 title TEXT NOT NULL,
 description TEXT,
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed','cancelled')),
 starts_at INTEGER NOT NULL,
 timezone TEXT NOT NULL,
 rrule TEXT,
 schedule_version INTEGER NOT NULL DEFAULT 1 CHECK(typeof(schedule_version) = 'integer' AND schedule_version >= 1),
 mutation_token TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL,
 completed_at INTEGER,
 cancelled_at INTEGER
);
--> statement-breakpoint
CREATE INDEX reminders_user_status_idx ON reminders(user_id, status);
--> statement-breakpoint
CREATE TABLE reminder_occurrences (
 id TEXT PRIMARY KEY NOT NULL,
 user_id TEXT NOT NULL REFERENCES users(id),
 reminder_id TEXT NOT NULL REFERENCES reminders(id),
 schedule_version INTEGER NOT NULL CHECK(typeof(schedule_version) = 'integer' AND schedule_version >= 1),
 scheduled_for INTEGER NOT NULL,
 trigger_at INTEGER NOT NULL,
 trigger_version INTEGER NOT NULL DEFAULT 1 CHECK(typeof(trigger_version) = 'integer' AND trigger_version >= 1),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','triggered','done','skipped','cancelled')),
 trigger_count INTEGER NOT NULL DEFAULT 0 CHECK(typeof(trigger_count) = 'integer' AND trigger_count >= 0),
 last_triggered_at INTEGER,
 handled_at INTEGER,
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX reminder_occurrences_logical_unique ON reminder_occurrences(reminder_id, schedule_version, scheduled_for);
--> statement-breakpoint
CREATE INDEX reminder_occurrences_user_status_trigger_idx ON reminder_occurrences(user_id, status, trigger_at);
--> statement-breakpoint
CREATE INDEX reminder_occurrences_reminder_status_idx ON reminder_occurrences(reminder_id, status);
--> statement-breakpoint
CREATE INDEX reminder_occurrences_due_idx ON reminder_occurrences(trigger_at) WHERE status = 'pending';
