# Notification Phase 1 implementation report

Date: 2026-09-23. Implements the approved Notification prompt plus the confirmed corrections.
Domain implementation is complete. **Production channel adapter pending.** No production writes,
notifications, deployment, push, or real credentials were used.

## 1. Changed files and working-tree ownership

This task began on an already dirty Reminder working tree. The pre-implementation file snapshot
was saved at `/tmp/iris-notification-baseline`; no reset, checkout, clean or stash was used.
The shared checkout also received completion changes from the separate Reminder work during this task.
Those changes were retained; a diff against HEAD must not attribute all Reminder work to Notification.

Pre-existing/separate Reminder work: `0004_reminder.sql`, Reminder schema, recurrence service,
Reminder services/controllers/routes/schemas and test fixtures/suites, package/lockfile changes,
Reminder PRD and `docs/reminder-phase1-implementation.md`. The existing `reminder-api.md` and its
Skill loading entry arrived from that work; Notification updated their integration wording instead
of replacing the Reminder contract. In particular, Notification did not edit `src/services/reminders.ts`
or `src/services/recurrence.ts`, redesign Reminder tables, or touch Finance domain services.

New Notification files:

- `drizzle/0005_notification.sql`
- `src/providers/notification-channel.ts`
- `src/services/notification-selection.ts`
- `src/services/notification-acceptance.ts`
- `src/services/notification-dispatcher.ts`
- `src/services/notifications.ts`
- `src/schemas/notification.ts`
- `src/routes/notifications.ts`
- `src/controllers/notifications.ts`
- `tests/notification-fixture.ts`
- `tests/notification-acceptance.test.ts`
- `tests/notification-dispatcher.test.ts`
- `tests/notification-routes.test.ts`
- `tests/notification-scheduled.test.ts`
- `skills/iris/references/notification-api.md`
- This report.

Necessary integration changes:

- `src/db/schema.ts`: append four Notification tables; composite ownership FK and indexes.
- `src/services/reminder-scheduler.ts`: acceptance plan, canonical dedupe, keyset scan and eligibility filter.
- `src/index.ts`, `wrangler.jsonc`: minute Reminder/Delivery and daily Finance cron dispatch.
- `src/app.ts`: authenticated Notification route registration; injectable adapters for tests.
- `src/lib/error-codes.ts`, `src/lib/response.ts`, `src/controllers/service-errors.ts`: explicit safe error mapping.
- `tests/reminder-scheduler.test.ts`: canonical dedupe expectation.
- `tests/reminder-integrity.test.ts`, `tests/schema.test.ts`, `tests/routes.test.ts`: new table/error inventory.
- `skills/iris/SKILL.md`, `skills/iris/references/reminder-api.md`: integrated scope/source action routing.
- `skills/iris/references/openapi.json`: regenerated from actual source.
- `docs/05_Iris_Reminder_v0.2.2.md`: minimal integration/status/dedupe documentation synchronization.
- `docs/06_Iris_Notification_v0.2.3.md`: confirmed contract and implementation status incorporated into the relevant sections.

## 2. Migrations added

`0005_notification.sql` is additive. It creates four tables and their indexes; no existing table
is altered or dropped. Tests apply all real SQL migrations to isolated local D1.
`0004_reminder.sql` was already part of the Reminder work, not a Notification migration.
No production or persistent development database migration was run.

## 3. Notification schema

`notifications`: id, user_id, source_type, source_id, source_version, dedupe_key, title, nullable
body, created_at. No updated_at/status/read/sent/failed fields. The current source_type is
reminder_occurrence. Source version is a positive integer. Source context is not stored.
Unique user/dedupe and user/id keys; user/created index.

## 4. NotificationDelivery schema

`notification_deliveries`: id, user_id, notification_id, channel, status, attempt_count,
next_attempt_at, last_attempt_at, sent_at, provider_message_id, last_error_code,
last_error_message, claim_token, claim_expires_at, created_at, updated_at.
Status is pending/sent/failed. Pending requires next_attempt_at; terminal rows clear it.
Composite FK binds notification_id and user_id to the same owner. Unique notification/channel;
partial unique notification index for pending; due and user/notification indexes.

## 5. NotificationSettings schema

`notification_settings`: user_id primary key, enabled, created_at, updated_at.
No implicit enabled=true. GET missing returns 422 NOTIFICATION_SETTINGS_NOT_FOUND, following
the repository's explicit settings pattern. PUT upserts the explicitly supplied boolean.

## 6. NotificationChannel schema

`notification_channels`: id, user_id, channel, enabled, priority, created_at, updated_at.
Unique user/channel. Priority is an integer 0–2147483647. CREATE requires all three configurable
fields; identifier is trimmed/lowercased and checked against the server registry. PATCH only
accepts enabled/priority and must be nonempty. Channel identity cannot be patched; no DELETE.
Duplicate channel creation returns 409. No credentials or destination URLs are accepted/stored.

## 7. Notification immutability

Only internal Reminder acceptance inserts Notification. No public create/edit/delete/action/retry
routes or service mutation methods exist. Retries load persisted title/body, never current
Reminder text. Notification APIs return safe snapshots without dedupeKey or execution claims.
Immutability is enforced at the application boundary; administrative direct SQL is not an API.

## 8. Source and dedupe

source_type=reminder_occurrence, source_id=occurrence.id, source_version=trigger_version.
Canonical dedupe: `reminder-occurrence:{occurrenceId}:trigger:{triggerVersion}`.
The existing older key format was only used by the test acceptor, so no data compatibility
migration was needed. schedule_version remains the schedule identity; trigger_version is the
execution generation. DELAY can produce another immutable Notification for a new generation.

## 9. ReminderOccurrence atomic acceptance

A parent mutation_token fence protects the current metadata/schedule snapshot. Validation checks
pending, expected triggerVersion/triggerAt, due time, parent active and current schedule version.
The batch persists Notification, selects/inserts initial Delivery, verifies both exist, transitions
the occurrence with count/timestamp, and retains the original prepareAdvance next-occurrence work.
Every operation commits or rolls back together. Earlier DONE/SKIP/CANCEL/RESCHEDULE/DELAY wins;
earlier acceptance retains the event and Delivery. Lost CAS retries against the latest state.

## 10. D1 atomicity strategy actually used

D1Database.batch with conditional SQL, the existing parent mutation fence, and a fenced CHECK
assertion that aborts the batch if durable acceptance did not persist both rows. No remote enqueue,
HTTP call or traditional BEGIN/COMMIT transaction wrapper is used. Existing single-statement test
acceptors remain supported, but the production domain seam uses a multi-statement acceptance plan.
Fallback similarly uses a single batch with a claim-token fence and the one-pending unique index.

Cloudflare's public D1 batch documentation was retrieved and checked: batch statements run
sequentially as a SQL transaction and failure rolls back the sequence. Runtime tests inject actual
D1 trigger failures and pause before batch submission to verify commit ordering.

## 11. Channel usability resolution

Runtime adapter availability/config is checked centrally. Shared SQL selection requires current
enabled settings/channel rows. Initial/fallback selection is repeated within the atomic batch,
so settings changes committed first are observed. Unknown adapter names cannot be created through
the API. Already-existing configs without an adapter are skipped. No network health check is used.

## 12. Initial channel selection and scheduler fairness

Choose one usable channel by priority ASC, created_at ASC, id ASC. No standby/fan-out rows.
No usable channel means no event, no Delivery and no occurrence transition.

Reminder scanning uses (trigger_at,id) keyset pagination; defaults: page 100, scan budget 1000,
accepted-process budget 100. Blocked records do not end the same run. A SQL eligibility prefilter
excludes persistently unconfigured/disabled/unusable users before LIMIT, preventing a blocked
backlog larger than the scan budget from starving eligible users. The acceptance batch still
performs authoritative checks. Tests cover both page continuation and a 1,100-row blocked backlog.

## 13. Delivery dispatcher

Select due pending rows, claim atomically, load immutable Notification/sourceContext, resolve
adapter by Delivery.channel, send, and persist a fenced result. Per run selects at most 100 rows,
with up to 5 concurrent workers across Notifications. Each claim uses current time; lease is
60 seconds, send timeout 15 seconds with AbortSignal. Late old claims cannot overwrite new results.
Minute cron runs Reminder then Delivery even after a Reminder scan exception; daily cron only FX.

## 14. Retry strategy

At most 5 reserved attempts including first send and crashed attempts. Counter/last_attempt_at are
persisted at claim, not double-incremented on response. Backoff after attempts 1–4: 1, 5, 15, 60 minutes.
Timeout/429/5xx/network failures are retryable; permanent failures or budget exhaustion are terminal.
A last-attempt crash is finalized after lease expiry without an extra send. Worker crash/failed DB
write can retry a provider request, so stable idempotency remains necessary. next_attempt_at is an
earliest time, with approximately one-minute scheduler precision, not a seconds-level guarantee.

## 15. Provider idempotency strategy

Every attempt uses delivery_id as stable idempotencyKey. External semantics are at-least-once with
best-effort provider deduplication. No claim can guarantee exactly-once external delivery. Timeout
is unknown outcome and never marked sent without confirmation. Provider-specific handling belongs
to the future real adapter; mock tests prove stable keys, timeout classification and recovery.

## 16. Fallback strategy

Terminal failure + latest eligible untried backup creation + old claim release happen in one batch.
Any insertion failure rolls back the failed transition; lease recovery safely retries. After a
successful commit, replay has no matching claim token and cannot reopen the chain. Existing sent
or pending blocks backup creation; previously tried channels never receive a second lifecycle.
New backup is picked up on a later dispatcher run, preserving bounded sequential processing.

## 17. Existing Delivery versus later settings

Disabling the existing channel or global settings does not cancel a Delivery or its retries.
Global disable blocks new initial/fallback selection. Adapter/config removal becomes normalized
terminal failure and can fall back. Settings updates do not scan/revive historical failures.

## 18. Reminder actions

After acceptance, DONE/SKIP/CANCEL/RESCHEDULE/DELAY never remove Notification, cancel Delivery,
stop retries or prevent fallback. DELAY increments triggerVersion on a real time change and may
later create another Notification. Existing frozen occurrence progression and schema are reused.

## 19. Derived state and source context

Only persisted Delivery history determines state: any sent → delivered; else any pending →
delivering; else failed. No settings/adapter lookup during reads. Later channel changes leave
historical failed results unchanged. sourceContext.reminderId is resolved through user-scoped
occurrence/reminder relations, nullable defensively; it is neither stored nor another identity.

## 20. First real adapter

**Production channel adapter pending.** No existing provider contract/config was available.
Production registry is empty. FakeNotificationAdapter is under tests only, injected explicitly.
Consequently production cannot currently configure a registered channel or deliver reminders;
occurrences remain pending. No endpoint, credential scheme or destination was guessed.

## 21. New error codes

404: NOTIFICATION_NOT_FOUND, NOTIFICATION_CHANNEL_NOT_FOUND,
NOTIFICATION_DELIVERY_NOT_FOUND (reserved; no standalone Delivery lookup route).
422: NOTIFICATION_SETTINGS_NOT_FOUND, INVALID_NOTIFICATION_CHANNEL,
NOTIFICATION_DISABLED, NO_USABLE_NOTIFICATION_CHANNEL (the latter two are internal conditions).
409: NOTIFICATION_CHANNEL_ALREADY_EXISTS. Existing BAD_REQUEST/UNAUTHORIZED/INTERNAL_ERROR reused.
Provider errors are normalized metadata, not public raw exception messages.

## 22. Security and user isolation

All root/static/nested routes use Bearer authentication and context user ownership. Cross-user
lookups use missing-resource semantics. Composite Delivery FK prevents mismatched ownership.
Strict schemas reject user_id, secrets, unknown fields and PATCH channel. Provider exception text
is discarded; last_error_message remains null; only allowlisted codes and safe status/ID data
survive. Logs omit message body, SQL, credentials and raw errors. Claims are internal only.

## 23. Tests added and validation

77 Notification cases cover immutable snapshots/dedupe, initial selection/settings, insert and
progression rollback, stale identities, five action-first races, concurrent acceptance, source
context, keyset starvation, success, HTTP classification, actual timeout/abort, stable retry keys,
exhaustion, fallback priority/config changes, all-failed/no-resurrection, five source actions,
lease crashes/stale results, rollback recovery, uniqueness, HTTP auth/isolation and cron routing.

Final full suite: **543 passed / 13 failed, 27 files (24 passed / 3 failed)**. The 13 failing
Finance cases were reproduced against the pre-Notification snapshot using the same installed
runtime; failure identifiers match exactly. They concern existing state/mock isolation. The third
failing suite is the existing Node test file collected by Vitest (node:test import incompatibility).
Running it correctly with node --test passed **35/35**. Finance services and broad test configuration
were not changed to conceal these baseline issues. All Notification tests and Reminder suites passed.

Typecheck passed. OpenAPI source/generated check passed. Wrangler deployment **dry-run** passed
(1,664.21 KiB uncompressed / 304.59 KiB gzip). No actual deployment occurred. rrule emits existing
missing-source sourcemap warnings, which do not fail tests. Test D1 migrations passed.

## 24. OpenAPI status

Generated from Hono routes/Zod source: **37 paths, 57 operations, 70 schemas**. Eight Notification
operations were added; no public Notification create/edit/delete/retry/action endpoints. Source and
artifact match. The exporter was run with node --import tsx because the sandbox blocks tsx CLI IPC;
this runs the repository's actual exporter, not a manually fabricated JSON document.

## 25. notification-api.md

Added compact semantics, source resolution, delivery lifecycle/fallback, settings/channel API,
errors, timing/idempotency limits and explicit production adapter availability. No OpenAPI copy.

## 26. Skill and reminder-api.md

Preserved the Reminder reference supplied by the separate Reminder work, updating only Notification
integration/dedupe/cadence/context statements. SKILL supports Notification reads/settings/channels;
Notification replies resolve sourceContext then load reminder-api.md for source actions. No automatic
Finance/content/Resource/Capability/OpenAPI loading. No arbitrary Notification creation guidance.

## 27. Reminder mismatches and prerequisites

All approved schedule/trigger fields already existed; **no Reminder integration prerequisite schema
was implemented**. The single-statement acceptance seam was extended to a plan while preserving the
atomic progression. Old dedupe spelling was unified. Existing daily cron was split by expression.
Shared schema/error inventory tests were updated, without changing frozen Reminder state semantics.
The separate Reminder task's historical implementation report is retained as its own phase record;
this report and the updated Notification PRD describe the combined current integration.

## 28. Intentionally out of scope

No real provider integration, fan-out, arbitrary Notification create, manual retry, read/unread,
dismiss, notification center, quiet hours, per-Reminder routing, digest, attachments, Watch/Rule,
email ingestion, dashboard, pause/resume or other v0.2+ features. No Finance domain changes.
No deployment, push, production migrations, real notifications, real credentials or user-data edits.

## 29. Exact commands

Run from the repository root. Tests use isolated local D1; applying a local migration separately is
optional and changes persistent development data. Migration commands include both the pre-existing
Reminder migration and the new Notification migration.

```sh
# Persistent development DB only, when desired:
pnpm db:migrate:local

# Notification tests (fake providers only):
pnpm exec vitest run tests/notification-acceptance.test.ts tests/notification-dispatcher.test.ts tests/notification-routes.test.ts tests/notification-scheduled.test.ts

# Entire suite; known baseline failures are documented above:
pnpm test
node --test skills/iris/scripts/iris-content.test.mjs
pnpm typecheck

# Normal project commands:
pnpm openapi:export
pnpm openapi:check
# Equivalent exporter invocation without tsx CLI IPC:
node --import tsx scripts/export-openapi.ts
node --import tsx scripts/export-openapi.ts --check

# Local bundle validation only:
pnpm bundle:check

# Local minute scheduler smoke (no real notification adapter registered):
pnpm exec wrangler dev --local --test-scheduled
# In another terminal:
curl 'http://localhost:8787/__scheduled?cron=%2A%20%2A%20%2A%20%2A%20%2A'
```

The deterministic cron tests also verify the daily FX branch using mocks. A live invocation of the
local daily FX branch can call Frankfurter if local Finance settings exist; it is not part of the
network-free Notification tests. Production release remains a separate authorized action after a
real adapter contract is supplied and all pending changes/migrations reviewed:

```sh
# Later only; not executed by this task:
pnpm db:migrate:remote
pnpm deploy
```
