CREATE TABLE notifications (
 id TEXT PRIMARY KEY NOT NULL,
 user_id TEXT NOT NULL REFERENCES users(id),
 source_type TEXT NOT NULL CHECK(source_type = 'reminder_occurrence'),
 source_id TEXT NOT NULL,
 source_version INTEGER NOT NULL CHECK(typeof(source_version)='integer' AND source_version>=1),
 dedupe_key TEXT NOT NULL,
 title TEXT NOT NULL,
 body TEXT,
 created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX notifications_user_dedupe_unique ON notifications(user_id,dedupe_key);
--> statement-breakpoint
CREATE UNIQUE INDEX notifications_id_user_unique ON notifications(id,user_id);
--> statement-breakpoint
CREATE INDEX notifications_user_created_idx ON notifications(user_id,created_at);
--> statement-breakpoint
CREATE TABLE notification_settings (
 user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id),
 enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE notification_channels (
 id TEXT PRIMARY KEY NOT NULL,
 user_id TEXT NOT NULL REFERENCES users(id),
 channel TEXT NOT NULL,
 enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
 priority INTEGER NOT NULL CHECK(typeof(priority)='integer' AND priority>=0 AND priority<=2147483647),
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX notification_channels_user_channel_unique ON notification_channels(user_id,channel);
--> statement-breakpoint
CREATE INDEX notification_channels_selection_idx ON notification_channels(user_id,enabled,priority);
--> statement-breakpoint
CREATE TABLE notification_deliveries (
 id TEXT PRIMARY KEY NOT NULL,
 user_id TEXT NOT NULL REFERENCES users(id),
 notification_id TEXT NOT NULL,
 channel TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sent','failed')),
 attempt_count INTEGER NOT NULL DEFAULT 0 CHECK(typeof(attempt_count)='integer' AND attempt_count>=0),
 next_attempt_at INTEGER,
 last_attempt_at INTEGER,
 sent_at INTEGER,
 provider_message_id TEXT,
 last_error_code TEXT,
 last_error_message TEXT,
 claim_token TEXT,
 claim_expires_at INTEGER,
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL,
 FOREIGN KEY(notification_id,user_id) REFERENCES notifications(id,user_id),
 CHECK((status='pending' AND next_attempt_at IS NOT NULL) OR (status<>'pending' AND next_attempt_at IS NULL)),
 CHECK((claim_token IS NULL) = (claim_expires_at IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX notification_deliveries_channel_unique ON notification_deliveries(notification_id,channel);
--> statement-breakpoint
CREATE UNIQUE INDEX notification_deliveries_one_pending ON notification_deliveries(notification_id) WHERE status='pending';
--> statement-breakpoint
CREATE INDEX notification_deliveries_due_idx ON notification_deliveries(status,next_attempt_at);
--> statement-breakpoint
CREATE INDEX notification_deliveries_user_notification_idx ON notification_deliveries(user_id,notification_id);
