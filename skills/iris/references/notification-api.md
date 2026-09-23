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
For “做完了 / 晚点 / 今天算了”, first confirm sourceType=reminder_occurrence; otherwise
do not call Reminder actions. Load [reminder-api.md](reminder-api.md), resolve/verify the exact occurrence,
and call `/reminders/{sourceContext.reminderId}/occurrences/{sourceId}/done`, `/delay`, or `/skip`.
Read the current occurrence before acting; old notifications may describe an earlier generation.
Prefer source context already present in the conversation; do not reread Notification merely
to rediscover known IDs. If context is missing, read it by its known notificationId. Null
sourceContext needs another independently established exact parent identity or clarification.
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
Never promise to retract or delete an accepted message.

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

## Query and channel workflows

- “最近有没有发送失败的通知”：list the relevant history and inspect deliveryState. There is
  no status/delivery_state query filter; filter returned events locally. If the question
  concerns individual failed attempts/channels, read the event's Deliveries: a failed primary
  Delivery can coexist with successful fallback, so it does not imply overall event failure.
- “刚才为什么通知我”：read the immutable snapshot and source identity; do not change the
  source object unless asked. Load reminder-api.md only if source inspection/action needs it.
- “为什么没提醒我”：with reminder-api.md, inspect exact occurrence state, match Notification
  sourceId/sourceVersion in the returned history, then inspect Deliveries. There is no public
  source_id filter or global occurrence lookup. Missing events do not prove provider failure.
- “把 Push 调成 Conduit 的后备”：read configured channels, resolve actual IDs, and update only
  enabled/priority as authorized so Conduit precedes Push. Preserve other channels and settings;
  verify the resulting order. These are example names, not registered production adapters.
  Report absent/unavailable channels; never invent IDs, auto-create providers or send secrets.
- Settings use PUT, not PATCH. Inspect success data after settings/channel mutations; read
  again only when needed (e.g. final order after multiple changes). Partial multi-write results
  must be reported accurately. Do not reset unrelated priorities merely to get tidy numbers.
