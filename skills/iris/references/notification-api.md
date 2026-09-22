# Notification Phase 1

Notification is an immutable, durable message snapshot created by Reminder domain logic.
There is no public Notification CREATE/PATCH/DELETE, manual retry, read/unread, dismiss,
acknowledge, or Notification-owned DONE/DELAY/SKIP API. Never bypass Reminder with arbitrary messages.

## Availability and acceptance

**Production channel adapter pending.** The server currently registers no production adapter.
Fake adapters exist only in injected tests. Saving/enabling settings does not make delivery
available. An unknown/unregistered channel is rejected; do not invent a provider or endpoint.

Acceptance requires a usable channel: settings enabled, channel enabled, registered adapter,
and required runtime configuration. Without one, no Notification/Delivery is created and the
ReminderOccurrence stays pending. Acceptance atomically persists Notification + initial Delivery
+ occurrence triggered/count/timestamp + any next occurrence required by Reminder.

## Source and follow-up actions

Canonical identity is `sourceType=reminder_occurrence`, `sourceId=occurrenceId`,
`sourceVersion=triggerVersion`. It is not the scheduleVersion. Internal dedupe is
`reminder-occurrence:{occurrenceId}:trigger:{triggerVersion}` and is not returned by default.
Title/body are snapshots; later edits and retries do not rewrite them.

Response `sourceContext.reminderId` is resolved by the server through user-scoped relations,
not stored as another identity. If the relation is unavailable, sourceContext is null.
For “做完了 / 晚点 / 今天算了”, load **reminder-api.md**, resolve/verify the exact occurrence,
and call `/reminders/{sourceContext.reminderId}/occurrences/{sourceId}/done`, `/delay`, or `/skip`.
Read the current occurrence before acting; old notifications may describe an earlier generation.
If the target/intent cannot be resolved reliably, ask; never guess from title/body.
No global occurrence lookup or Notification business-action endpoint exists.

## Delivery and state

A Delivery is one lifecycle per Notification + channel, with status pending / sent / failed.
Only one pending Delivery per Notification is allowed. Channels form a sequential priority
fallback chain, not simultaneous fan-out. Lower priority numbers win; ties use createdAt then id.
Backup Deliveries are created only when the current Delivery becomes terminal failed, using
current enabled/usable untried channels. Failed transition and backup creation commit atomically.

`deliveryState` uses **persisted Deliveries only**: any sent → delivered; otherwise any pending
→ delivering; otherwise failed. Reading state never consults current channel settings.
Later enabling/adding channels does not revive a historical failed Notification.

Existing Delivery retries continue after settings/channel disable and after Reminder
DONE/SKIP/CANCEL/RESCHEDULE/DELAY. Global disable blocks new acceptance/fallback selection.
DELAY can produce another Notification with a new triggerVersion; the old one continues.

Dispatcher reserves at most 5 attempts, including attempts whose worker crashes. Retry delays
are 1, 5, 15, 60 minutes; nextAttemptAt is the earliest eligible time. Scheduler runs about once
per minute, without a seconds-level SLA. External delivery is at-least-once with best-effort
provider deduplication; a provider without idempotency can deliver duplicates after a timeout.
`sent` means provider-confirmed success, not that the user read the notification.

## API

All paths below are under `/api/v1/notifications`, Bearer authenticated and user scoped.
Requests use snake_case, responses camelCase and `{success:true,data:...}`. Cross-user resources
return the same not-found response as missing resources. Lists follow current repo convention:
arrays without pagination; do not invent cursor/limit parameters.

| Method/path | Contract |
| --- | --- |
| GET root | Optional source_type=reminder_occurrence, from, to; createdAt inclusive range, from≤to; createdAt DESC, id ASC |
| GET `/{notificationId}` | Snapshot, source identity, sourceContext and derived deliveryState |
| GET `/{notificationId}/deliveries` | Delivery history, attempts/times, safe providerMessageId and lastErrorCode |
| GET `/settings` | Explicit existing settings; missing returns 422 |
| PUT `/settings` | Strict `{"enabled":true}` or false; upsert, no implicit enable |
| GET `/channels` | Stable priority order |
| POST `/channels` | Strict channel, enabled, priority; 201; registered lowercase identifier |
| PATCH `/channels/{channelId}` | Nonempty enabled/priority only; channel identity immutable |

Channel priority is an integer 0–2147483647. CREATE requires all three fields; channel is
trimmed/lowercased. One config per user + channel; duplicate CREATE returns 409. There is no
DELETE; set enabled=false. No endpoint accepts credentials, tokens, destinations or provider URLs.
Delivery responses omit internal claims, raw errors and secrets. A disabled existing channel
can still have pending Deliveries; that is intentional.

## Errors

- 400 BAD_REQUEST: unknown fields, invalid time range/type, PATCH channel, empty PATCH.
- 401 UNAUTHORIZED: follow Skill credential handling; never expose tokens.
- 404 NOTIFICATION_NOT_FOUND / NOTIFICATION_CHANNEL_NOT_FOUND: missing or outside user scope.
- 409 NOTIFICATION_CHANNEL_ALREADY_EXISTS: read existing channel and update if authorized.
- 422 NOTIFICATION_SETTINGS_NOT_FOUND: explicitly configure enabled before acceptance.
- 422 INVALID_NOTIFICATION_CHANNEL: unregistered adapter identifier; no production adapter yet.
- NOTIFICATION_DELIVERY_NOT_FOUND is reserved; there is no standalone Delivery lookup route.
- NOTIFICATION_DISABLED / NO_USABLE_NOTIFICATION_CHANNEL are internal selection conditions;
  they do not mean an occurrence is failed/cancelled/triggered.
- Delivery lastErrorCode contains normalized metadata such as TIMEOUT, RATE_LIMITED,
  PROVIDER_5XX, MISSING_RUNTIME_CONFIG, ADAPTER_UNAVAILABLE or RETRY_EXHAUSTED.

Load this reference for Notification reads/settings/channels. Load reminder-api.md for source
business actions. Do not automatically load Finance/content/Resource/Capability references or
all of openapi.json. Read OpenAPI only for an exact schema, debugging or detected drift.
