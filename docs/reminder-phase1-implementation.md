# Iris v0.2 Reminder Phase 1 — implementation and verification

Date: 2026-09-23. Base: `main`, commit `65537a88da68be5fd92a8577de29a46b0823c3a8`.
The two rounds of user-confirmed contract corrections override the initial prompt.
This report describes the **Reminder-only deliverable**, not concurrent Notification work.
No production deployment, migration, API request, push or notification was performed.

## 1. Changed files

New Reminder production files:

- `drizzle/0004_reminder.sql`
- `src/services/recurrence.ts`, `src/services/reminders.ts`, `src/services/reminder-scheduler.ts`
- `src/schemas/reminder.ts`, `src/controllers/reminders.ts`, `src/routes/reminders.ts`

Shared integration: `src/db/schema.ts`, `src/app.ts`, `src/index.ts`,
`src/lib/error-codes.ts`, `src/lib/response.ts`, `src/controllers/service-errors.ts`.
Dependencies: `package.json`, `pnpm-lock.yaml` (only RRULE/Temporal and their dependencies).
Tests: five `tests/reminder-*.test.ts` files, `tests/reminder-fixture.ts`, and the approved
table/error inventories in `tests/schema.test.ts` and `tests/routes.test.ts`.
Documentation: `skills/iris/SKILL.md`, `skills/iris/references/reminder-api.md`, generated
`skills/iris/references/openapi.json`, `docs/05_Iris_Reminder_v0.2.2.md`, and this report.

During execution, another workflow added Notification documents, migration and source,
including edits to shared schema and reminder-scheduler.ts. Those changes were preserved.
They are excluded from this report's Reminder scope and isolated verification snapshot.

## 2. Migrations added

`0004_reminder.sql` adds only reminders and reminder_occurrences plus constraints/indexes.
Existing Core/Finance migrations and table semantics are unchanged. Applied successfully
in isolated test D1 and bundled-runtime smoke D1. No production/local development DB was migrated.
`0005_notification.sql` belongs to concurrent work, not this deliverable.

## 3. Reminder schema

UUID id, user_id FK, nullable project_id FK, title, nullable description,
status active/completed/cancelled, starts_at, timezone, nullable rrule,
schedule_version initially 1, created_at/updated_at/completed_at/cancelled_at.
Internal mutation_token supplies a conditional-write fence; it is not exposed in responses.
All timestamps store epoch milliseconds and return UTC ISO strings.
No duplicate next_trigger_at column is stored.

## 4. ReminderOccurrence schema

UUID id, user_id/reminder_id FKs, schedule_version, immutable scheduled_for,
trigger_at, trigger_version initially 1, pending/triggered/done/skipped/cancelled,
trigger_count initially 0, nullable last_triggered_at/handled_at, created_at/updated_at.
No delayed status, complex trigger history, Task/Milestone/Resource binding or delivery data.

## 5. Reminder API

POST/GET `/api/v1/reminders`; GET/PATCH `/api/v1/reminders/{reminderId}`;
POST `/api/v1/reminders/{reminderId}/cancel`.
Create returns 201; reads/PATCH/actions return 200 with success/data envelope.
List supports status/project_id, orders by createdAt descending then id ascending.
nextTriggerAt is the earliest trigger_at across all pending occurrences, or null.
CREATE atomically writes definition and first pending, even when starts_at is overdue.

## 6. Occurrence API

GET `/api/v1/reminders/{reminderId}/occurrences` and `.../occurrences/{occurrenceId}`;
POST `.../{occurrenceId}/done`, `/delay`, `/skip`.
List filters status/from/to; time filters are scheduled_for, inclusive, with from <= to.
Order: scheduled_for then schedule_version ascending. No pagination added.
DONE/SKIP/CANCEL accept no body (without JSON content type) or `{}`.
DELAY accepts only `{"until":"<absolute ISO datetime>"}`.

## 7. DONE behavior

pending/triggered → done with handled_at. Same-action retry is idempotent.
Current-version frontier advances only if no later occurrence already exists in that version.
Old-version DONE never advances a schedule. Parent completes only when no future schedule
and no pending/triggered in any version remain. Cancelled parent stays cancelled.

## 8. DELAY behavior

Only pending/triggered of the current version of an active parent may DELAY.
until must be strictly future. A changed trigger_at increments trigger_version and sets
pending; identical still-future target is a no-op. scheduled_for, schedule definition,
trigger_count and last_triggered_at are preserved. A→B→A creates a new execution generation.
Other delayed/normal occurrences coexist unchanged. Final recurring and one-time triggered
remain active and can DELAY; no completed→active exception exists.

## 9. SKIP behavior

pending/triggered → skipped with handled_at; repeated SKIP is safe.
Same progression/completion rules as DONE; different terminal-state actions are rejected.
SKIP means this occurrence is omitted while subsequent rules continue.

## 10. CANCEL behavior

Atomically cancels every pending across all versions, including overdue and delayed.
Historical triggered remains available for DONE/SKIP only. DELAY is forbidden.
Repeated CANCEL preserves cancelled_at; parent never returns to active/completed.

## 11. RESCHEDULE/PATCH behavior

Metadata-only changes leave occurrences untouched. Nullable fields can be cleared.
Real starts_at/timezone/rrule changes increment schedule_version; equal or canonically
equal RRULE updates do not. Reschedule is allowed only for an active parent.
All old pending are cancelled atomically; triggered/done/skipped/cancelled history is preserved.
A future anchor creates its first pending; a past one-time creates one overdue pending;
a past recurring selects the first valid time strictly after now. An exhausted replacement
rule is accepted with no new occurrence, and completion is recomputed. Old triggered keeps
parent active until handled. A→B→A is legal because identity includes schedule_version.

## 12. RRULE library / recurrence implementation

Pinned rrule 2.8.1 plus @js-temporal/polyfill 0.5.1. No Node-only runtime requirement.
RRULE supplies calendar candidate generation, Temporal supplies zone conversion.
The wrapper validates the supported subset and applies COUNT/UNTIL after DST gap filtering.
Supports DAILY/WEEKLY/MONTHLY/YEARLY, INTERVAL, BYDAY, BYMONTHDAY, BYMONTH, COUNT or UNTIL.
UNTIL is inclusive UTC `YYYYMMDDTHHmmssZ`; COUNT+UNTIL, DTSTART/TZID, unsupported keys/frequencies
and invalid combinations are rejected. Common syntax/default ordering is canonicalized.
COUNT traversal starts at the anchor: very old, large-count schedules have linear cost;
no high-volume recurrence benchmark or additional cache subsystem is claimed.

## 13. Timezone handling

Validate IANA zone, convert absolute starts_at to local wall time, require anchor match.
Spring gaps/nonexistent month dates are skipped without consuming COUNT; fall overlap uses
the first instant, and an anchor on the second instant is rejected. Real missed cycles
consume COUNT. DELAY does not. Z/offset inputs need not visually match the zone offset.
One-time/DELAY use absolute instants rather than ambiguous local strings.

## 14. scheduled_for vs trigger_at

scheduled_for remains the logical cycle identity within schedule_version.
trigger_at is the current execution target and may change without moving scheduled_for.
Execution identity is occurrence_id + trigger_version, not trigger_at alone.
Both version and expected trigger_at are checked during atomic acceptance.

## 15. Occurrence uniqueness strategy

UNIQUE(reminder_id, schedule_version, scheduled_for), DB status/version/count checks and FKs.
Indexes: reminders(user_id,status); occurrence(user_id,status,trigger_at),
occurrence(reminder_id,status), plus pending-only trigger_at index for cross-user due scans.
No occurrence identity is rewritten during reschedule.

## 16. Scheduler architecture

Reminder-only run selects at most 100 due pending rows per poll, ordered by trigger_at/id.
A same-D1 acceptance adapter prepares a guarded durable INSERT; the transaction also changes
occurrence status/count and creates any required next occurrence. An adapter that writes no
event rolls back instead of claiming success.
The Phase 1 entrypoint has no production acceptor: it reports integration pending, mutates
nothing, and preserves the existing daily FX schedule. No per-minute empty polling was enabled.
Concurrent Notification work has since extended this shared seam; that integration needs
its own combined acceptance tests and is not certified by this Reminder-only report.

## 17. Downtime / missed recurrence behavior

Advance strictly after max(now,current scheduled_for), and do not advance again when a later
same-version occurrence exists. Ungenerated missed periods are not replayed. Every already
materialized overdue/delayed occurrence remains eligible; user-requested delays are not dropped.
Past-due one-time executes once when a real acceptance subsystem is eventually connected.

## 18. Idempotency / claim strategy

All domain mutations first conditionally replace the parent's mutation_token in the same
D1 batch. Subsequent statements require that unique token; a stale reader skips its writes
and retries current state. This is not a persisted lease and adds no public processing status.
Normal competition does not return REMINDER_BUSY. Repeated acceptance never increments a
previously accepted trigger_version again. Aborted transactions preserve retry identity.

## 19. Notification handoff boundary

Future unique acceptance is `(occurrence_id,trigger_version)`. Payload includes user/reminder/
occurrence IDs, both versions, scheduledFor, triggerAt, title/description and acceptance time.
Acceptance requires pending, expected version/time, active parent and current schedule version.
Event, status/count and next cycle share one D1 batch: all commit or all roll back.
Action-first blocks stale acceptance; acceptance-first preserves the event even after DELAY.
No delivery channel, production Notification table or remote async enqueue was implemented here.

## 20. New error codes

404: REMINDER_NOT_FOUND, REMINDER_OCCURRENCE_NOT_FOUND.
409: INVALID_REMINDER_STATE, INVALID_OCCURRENCE_STATE.
422: INVALID_TIMEZONE, INVALID_RRULE, INVALID_DELAY_TIME.
Reuses BAD_REQUEST/UNAUTHORIZED/PROJECT_NOT_FOUND/INTERNAL_ERROR.
REMINDER_BUSY is only reserved conceptually for future uncertain external ownership.

## 21. Security / user isolation

Bearer middleware protects both Reminder root and descendants. All ID reads/mutations verify
user and nested parent scope; Project association is ownership-checked. Cross-user records
return not found. Strict schemas reject unknown/client-owned status/version fields.
SQL uses bound values. Logs contain IDs, event names and counts, never tokens/descriptions/SQL.

## 22. Tests added and actual results

Five suites: recurrence (20), services (19), scheduler (17), routes (13), integrity (5):
**74 Reminder tests passed**. They cover the corrected contract including DST, COUNT/UNTIL,
version rollback, early/historical actions, multiple delayed rows, atomic failure injection,
no-op acceptor rejection, A→B→A, and deterministic D1 transaction interleaving.

Full Reminder-only snapshot: **466 passed, 13 failed, 23 files (20 passed / 3 failed)**.
Original HEAD with the same installed toolchain: **392 passed, 13 failed, 18 files**.
Compared failure identifiers exactly: no new failure identifiers in the Reminder-only snapshot.
Existing failures are Finance test state/mock isolation and a Node test file collected by
Vitest. Running that file with `node --test` separately passed **35/35**.
These existing failures were recorded rather than changing Finance or broad test configuration.

Typecheck passed; OpenAPI source/generated equality passed; Wrangler dry-run passed.
Bundled Workerd smoke passed with compatibility_date=2026-08-22 and **no nodejs_compat**,
including migrations, auth, recurrence CREATE/DONE and OpenAPI.
rrule's package emits missing-source sourcemap warnings in Vitest; they did not fail tests.
A final redundant combined check was rejected by automatic approval review due to service
usage limits; it was not reported as executed. The prior successful checks remain recorded.

## 23. OpenAPI status

Generated from real Hono source using the repository exporter, then equality-checked.
Reminder-only output: 31 paths, 49 operations, 63 schemas, including 10 Reminder operations.
Regeneration also includes Finance operations already present in source but absent from the
previous generated file. This is generated-source synchronization, not a Finance semantic change.
Concurrent Notification additions may subsequently require their own regeneration.

## 24. reminder-api.md

Added compact endpoint, timing, recurrence, status/version, action, error and intent mapping.
Documents optional Project, exact-ID resolution, ambiguous follow-ups, no production delivery,
normal/delayed overlap, expired reschedule and atomic acceptance boundary.

## 25. SKILL.md progressive-loading changes

Added Reminder to the supported operation/loading map. Load reminder-api.md, plus project-api.md
only when resolving a Project; OpenAPI stays exact/debug fallback. No automatic Finance/content/
Resource/Capability reference loading. Removed blanket claims that Reminder is unsupported,
while retaining the explicit Notification integration-pending limitation for this phase.

## 26. Inconsistencies and verification scope

Resolved the initial prompt's single-pending constraint, unversioned logical uniqueness,
trigger_at-only identity, trigger-implies-completed rule, special one-time resurrection,
old-version action ambiguity and non-atomic async sink suggestion according to user decisions.
Updated the corresponding PRD sections rather than appending contradictory addenda.

The shared checkout began receiving concurrent Notification implementation during final tests:
new schema/migration, shared scheduler acceptance-plan API, eligibility/paging, and a changed
idempotency-key string format. Those external changes were preserved. Combined-checkout table
inventory failures and contract-test drift cannot be described as a clean Reminder-only run.
Final Reminder validation used `/tmp/iris-reminder-verified`, reconstructed from the base commit
plus this task's own changes. The independent patch/snapshot preserves the reviewed boundary;
it must not be blindly applied over the shared Notification work.

## 27. Intentionally out of scope / rollback

No Notification delivery, channels, email/push/Conduit, production events, Task binding, pause,
snooze, calendars, condition watches, analytics, deploy, push or production migration.
No broader Finance/test-framework cleanup. No changes to concurrent Notification assets.
Rollback is code-level revert/disablement of Reminder registration and scheduler hook while
retaining the additive tables and history. Do not drop user data to roll back application code.

## 28. Exact commands

Run in the desired checkout after reviewing its complete migration set. The shared checkout
now contains concurrent `0005_notification.sql`; the normal migration command would include it.
For Reminder-only migration/verification, use the isolated Reminder version.

```sh
# Apply locally only (the tests already applied migrations to their isolated D1).
pnpm db:migrate:local

# Reminder domain including local scheduler/atomic fake acceptance.
pnpm test tests/reminder-recurrence.test.ts tests/reminder-services.test.ts tests/reminder-scheduler.test.ts tests/reminder-routes.test.ts tests/reminder-integrity.test.ts

# Full regression (known baseline failures described above).
pnpm test
node --test skills/iris/scripts/iris-content.test.mjs

pnpm typecheck
pnpm openapi:export
pnpm openapi:check
pnpm bundle:check

# Optional local scheduled entrypoint, using local bindings only.
pnpm exec wrangler dev --local --test-scheduled
# In another terminal; reports Reminder integration pending and runs the existing FX dispatcher.
curl 'http://localhost:8787/__scheduled?cron=0%2020%20*%20*%20*'

# Later, only after reviewing all pending migrations and authorizing production release:
pnpm db:migrate:remote
pnpm deploy
```

No deployment or production command above was executed. The phase ends here; Notification
implementation and combined verification belong to the separate workflow.
