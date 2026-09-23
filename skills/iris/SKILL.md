---
name: iris
description: >-
  Manage persistent structured work/life state and durable project memory in Iris:
  Projects, Milestones, Tasks, Resources, Capabilities, Markdown Resource Content,
  Finance / Project Expense Tracking, Reminder scheduling definitions and occurrences,
  and Notification history/settings/channels.
  Use for Iris status/next-action queries, explicit state changes, Resource/Capability
  registration, saving PRDs, specs, design documents or long-term notes, and reading
  or editing existing Iris Markdown, recording Project expenses and querying costs, and explicit
  Reminder create/read/done/delay/skip/cancel/reschedule and Notification query/settings/channel requests. Do not trigger for ordinary translation,
  knowledge questions, temporary analysis, or undecided brainstorming.
---

# Iris

## Execute the Request, Then Explain the Data

For concrete Iris operations, perform Preflight, necessary reads, target resolution and
the authorized operation, then lead with retrieved data or verified results in the user's
language. Keep protocol reasoning internal; do not substitute Skill/architecture critique
for execution. Review the Skill only when requested. Loading it alone triggers no API call;
if no actionable request is supplied, ask what the user wants to do.

Execution-first preserves authorization, missing-target stops, Project-name requirements,
duplicate prevention, credential safety and verification. State a concrete blocker and ask
only for what is missing. Never claim execution without evidence.

## Runtime Configuration and Credential Safety

Load both `IRIS_API_URL` and `IRIS_API_TOKEN` from the approved `~/.iris/config.env`
(directory permission `700`, file `600`) in the same process as API requests/client calls.
Do not silently reuse exported values if the file or either setting is missing:

```sh
set +x
unset IRIS_API_URL IRIS_API_TOKEN
set -a
. "$HOME/.iris/config.env" || exit 1
set +a
```

Stop on loading failure or absent values. Ask the user to configure the missing setting
securely in that file and retry; never request a token in chat. Do not automatically run
`auth:create-remote` to repair configuration: each run creates a new user and Token.
Use the configured base URL, append paths without duplicate slashes, and never guess a URL
from docs; OpenAPI supplies no deployment server URL.

Keep actual URL/token values out of responses, logs, Markdown, source/scripts, Git and Iris
Memory. Do not hardcode them or persist the token outside the approved secret file.
Use runtime values directly; disable shell tracing, verbose Authorization output and
expanded command logging. Never dump the environment. Redact credentials/config values
in requested technical details. Provider secrets remain exclusively with the backend.

## Preflight

Run only for requests requiring Iris access, before the first operation in this task/session.
Reuse success in that running context; never persist readiness in D1 or Memory. Repeat after
URL/credential changes, authentication/connection failure or otherwise invalidated readiness.

1. Check both runtime settings without printing them. Missing `IRIS_API_URL` or
   `IRIS_API_TOKEN` → stop and direct the user to `~/.iris/config.env` without asking for secrets.
2. Call public `GET /health` without Bearer auth. Require `200`, `success:true`,
   `data.status:ok`; otherwise stop and report reachability/health failure, not a token error.
3. Call `GET /api/v1/test` using `Authorization: Bearer $IRIS_API_TOKEN` from runtime.
   Require `200`, `success:true`. Only both successful checks establish readiness.
   On `401`, invalidate readiness and direct the user to check the secure config: token may
   be missing, invalid, revoked or expired. Other failures leave readiness unset; report
   the failed check without guessing. Do not search for alternative Preflight endpoints.

## Core Operation Loop

```text
PREPARE → READ → RESOLVE → DECIDE → WRITE → VERIFY → RESPOND
```

For a read-only request or a decision that no change is needed, skip WRITE and mutation
verification, then respond from the retrieved evidence.

### PREPARE

Decide whether the request concerns Iris structured state or durable Markdown content. If not, answer without Iris calls.
Otherwise ensure Preflight has succeeded and load only the relevant reference sections.
Treat permission to inspect state as distinct from intent to change it.

### READ

**Read before write means read enough current state to resolve an existing target, an
ambiguity, or a duplicate risk.** It does not mean list every entity before every CREATE.
A clearly new “明天下午三点提醒我” can CREATE directly once time/timezone are resolved;
“以后都改成九点” requires reading the existing Reminder. Keep the entity-specific duplicate
checks below. After an uncertain write, read current state before retrying.
Conversation supplies intent and structured source IDs, not invented current state.

### RESOLVE

Use documented reads and actual Iris IDs; never invent entities or assume names are unique.
Resolve the owning Project where required and validate child relationships. Reminder's
Project is optional. Existing-record mutations require sufficient current API state;
Notification follow-ups use structured source identity as described below.
Ask when multiple candidates remain; title/description alone cannot identify an occurrence.

**Missing named target is a hard stop.** If a named Project or referenced existing Task
cannot be resolved, report it and ask for the correct target or explicit creation authority.
Do not create a replacement, perform dependent writes, or substitute the workspace's Project,
a similar name, or another available record. Similar matches are candidates only.
After clarification, resolve the confirmed target and apply duplicate checks. Silence is not confirmation.

**Insistence does not supply a Project name.** For Project/Task creation, “force create it”
still requires a Project name explicitly supplied or unambiguously confirmed in this context.
Ask if absent; do not infer it from the workspace. Do not ask again for an established name.
Task creation does not authorize creating a missing Project; that needs explicit authority.
This Project requirement must not be applied to personal Reminders.

“Add a new Task Y to resolved Project X” authorizes Y after duplicate checks, without an
extra confirmation merely because Y is new. “Mark Y complete” never authorizes creating Y.
For “Capability is finished,” inspect relevant Tasks to distinguish implementation completion
from Capability registration; registration is not proof that work finished.

### DECIDE

Determine whether the user intends a state change, which entity fits, whether it already
exists, and whether to reuse, update, or create it. Prefer updating existing state to
creating duplicates when they represent the same work and the requested change is clear.
If the requested state is already present, report that result without an unnecessary write.
Proceed with a clearly requested change once the entity and intended outcome are resolved;
ask only when missing information would change the target or meaning.

**Do not turn conversation into structured state indiscriminately.**
Record explicit long-term Projects, executable Tasks, meaningful Milestones, durable Resources,
reusable Capabilities, occurred Expenses, explicit Reminders and clear status changes
only when the user intends to record, schedule or modify them.
Do not automatically record casual comments, emotions, vague plans, undecided brainstorms,
knowledge questions, or one-off translations.

“This logo looks pretty good” creates no Task.
“Add a task to replace the logo tomorrow” can justify a Task in a resolved Project.
Current Task schemas have no scheduling or due-date field: preserve intended timing only as
ordinary Task text when appropriate, and disclose that no reminder or schedule was created.
When the user requests an actual reminder, route that scheduling intent to Reminder;
a Task and a Reminder are separate entities, with no implicit Task binding.

### WRITE

Write only the resolved change authorized by the user's intent. Load the matching module
reference from the routing table; do not load the aggregate guide for every operation.
Never invent endpoints, fields, enums or request shapes, or send database field names as
API fields. Preserve unrelated values. Follow business actions: DONE/DELAY/SKIP act on an
occurrence; CANCEL and permanent RESCHEDULE act on the Reminder definition.
Use only Iris APIs. Never call Frankfurter, notification providers, Conduit or GitHub directly,
request their secrets, or operate GitHub tokens; provider integration belongs to the backend.

### VERIFY

Inspect mutation responses for resolved identity, requested values and relationships.
Verify entity/content/Expense writes, Task transitions, archive/enable actions and settings;
for Reminder creation/reschedule/cancel verify the definition, for DONE/SKIP verify occurrence
state, and for DELAY verify triggerAt/status and the returned trigger generation. Verify
Notification settings and channel changes from their responses.
Read again only if the response cannot establish the result (e.g. content body verification).
Distinguish success, rejection and unknown outcome; never claim success without evidence.
A saved Reminder, accepted Notification, sent Delivery and user completion are different results.

### RESPOND

Lead with requested data, verified outcome or concrete blocker in the user's language.
For creation, report confirmed identity/name, status and Project when applicable; for reads,
report actual records. Distinguish unchanged state, partial success and unverifiable results.
Keep explanations tied to results; omit unsolicited architecture commentary, raw JSON,
headers and logs. Redact credentials in any requested technical detail.

## Entity Decisions and Duplicate Prevention

| Intent | Entity |
| ------ | ------ |
| Long-running context | Project |
| Meaningful project phase | Milestone |
| Concrete executable work | Task |
| Durable file, directory, repository, or URL | Resource |
| Reusable executable ability | Capability backed by a Resource |
| Already incurred Project cost | Expense (D1 structured state) |
| Reporting currency / current FX cache | Finance Settings / ExchangeRate |
| Time-based attention schedule / one execution | Reminder / ReminderOccurrence |
| Immutable durable message event | Notification |
| Actual delivery lifecycle / configured path | NotificationDelivery / NotificationChannel |

Before creating a Project, Task, Resource, or Capability, inspect existing records.
Also inspect existing phases before adding a Milestone. Compare meaning and scope, not just spelling.
“Connect Memory Repo” and “Integrate Iris Memory Repository” may describe the same Task;
reuse or update the existing Task when established, and clarify uncertain matches.

### Projects and Milestones

List Projects before creating one; consider archived records when checking whether a context
already exists. Do not create “Iris v0.1” merely because the user says “Build Iris v0.1.”
Normally use the existing Iris Project and an appropriate v0.1 Milestone.
Do not automatically unarchive an existing Project or create a new phase without user intent.
Milestones are optional: several Tasks or a shared topic alone do not justify one.
Use only the Project/Milestone statuses in their module references; archive is separate from Project status.

### New Project README initialization

When the user authorizes a new Project, initialize its durable project context as part
of the same Agent workflow, unless the user explicitly excludes README creation.
After Project duplicate checks and successful creation, use the returned Project ID to
inspect its Resources and create a project-scoped Markdown Resource through Iris.
Use `path=README.md`, `name=README.md`, and `role=context`; omit child scope IDs.
Load content-api.md for the exact requests. This creates a file in the server-configured
content repository, not a new repository or a shared repository-root README. Do not
construct a physical path or operate Git directly.

Use supplied README text or a minimal heading with the confirmed Project name and description
(if known), in the user's language. Invent no plans or background; create no unrelated entities.
Check for a README Resource, including on partial retries; read and reuse a match without
overwriting. Follow content-api.md for missing/ambiguous content or CONTENT_ALREADY_EXISTS;
never randomly rename or blindly retry. Resolving an older Project does not authorize
retroactive README initialization.

Verify both the Project and README creation responses, then GET the README content to
confirm the saved text. Report both outcomes. These are separate API writes, not an
atomic server operation: if README creation fails or its outcome is unknown, preserve
the Project, report the partial result and inspect current Resources/content before
resuming. Never recreate the Project, delete it as compensation or claim full success.

### Tasks and completion

Use only `todo`, `doing`, `completed`, and `cancelled` for Task status.
After resolving the actual Task, interpret explicit state statements as follows:

- “Started” or “working on it” → `doing`.
- “Finished,” “completed,” or “already done” → `completed`.
- Explicit cancellation → `cancelled`; do not delete the Task.
- “Almost done,” “probably finished,” or “might be ready” → do not automatically mark completed.

Use the Task update operation in task-api.md; there is no separate completion action.
Let the server manage completion time. Never write a fabricated `completed_at`, or treat
`updated_at` as completion time. Consult the references for exact field representations.
Keep long-form output in durable material referenced by Resources, not in Task descriptions.

### Resources and Capabilities

Resource records store metadata/location; use the Resource Content API to save long-term
Markdown, create PRD/spec files, read Resource contents or edit durable Memory.
Resource kinds are `repository`, `directory`, `file`, `url`;
roles are `context`, `spec`, `artifact`, `reference`.
Consult concepts.md for scope, location requirements, and Milestone/Task relationships;
consult resource-api.md for request schemas. Check existing Resources before creating one.

For Markdown CREATE / READ / UPDATE, follow the durable-content workflow below and
load content-api.md for endpoints and fields. Ordinary Resource POST registers a pointer;
Resource PATCH rebinds metadata only, and DELETE removes metadata only.
Ordinary PRDs, specs, notes and research are Resources, not Capabilities. Register a
Capability only for an intended reusable executable ability that satisfies concepts.md.

Capability types are `script` and `skill`; every Capability requires a Resource.
Match `script` to a file Resource and `skill` to a directory Resource in the same user/Project scope.
For registration, resolve the Project and an existing compatible Resource first.
Create a Resource only if genuinely absent and needed for the requested registration;
check existing Capabilities before registering the ability.
Do not bypass reference protection: disabled Capabilities still protect their Resources.
Use concepts.md for full integrity rules before changing these relationships.
Registration or enablement does not execute anything; the current API is a registry only.

## Durable Markdown Memory

D1 / Project Core holds **operational structured state**; Git-backed Markdown Resources
hold **durable long-form content**. “Implement GitHub Markdown API” is a Task;
“Iris Git-backed Memory Design” is a Markdown Resource. Keep full PRDs and large
long-term documents out of Task descriptions.

Load [content-api.md](references/content-api.md) for Markdown CREATE / READ / UPDATE,
request fields, path constraints, errors and examples; load Resource metadata only as needed.
Choose `spec` for PRDs/designs, `artifact` for outputs, `context` for long-term background,
and `reference` for supporting material. Project scope is normal for project-wide content;
use Task/Milestone scope only when the relationship is resolved and genuinely appropriate.

- CREATE: resolve Project → inspect Resources and candidate contents for duplicates → create
  genuinely new content → verify identity, role/scope and saved content as needed.
- READ: resolve Resource → read its actual content → answer from that text, never its name/path.
- UPDATE: read current content/revision → minimally edit → submit expected_revision → verify.
  Preserve unrelated text. Never use metadata updatedAt as proof of a content update.
- On conflict, read fresh content and reconcile; never blindly retry or overwrite. Missing
  content is not empty content or authority to recreate/delete. An uncertain write needs
  inspection before retry. Follow the module reference for exact recovery steps.

The existing local content client is an optional Iris API transport; no runtime helper is
required for these behaviors. When using its cache, follow [local-cache.md](references/local-cache.md)
for refresh, invalidation and account isolation. A cached revision is not concurrency authority.
Force-refresh for latest-state requests, conflicts and post-write content verification; never
report cached content as freshly verified. Preserve cache invalidation when mixing raw API writes
with that existing client. No direct provider access is permitted.

### Save-only versus save-and-plan

- “This is DeepUsername's PRD; save it”: resolve DeepUsername → inspect Resources →
  resolve a matching PRD or CREATE a new Markdown Resource with `role=spec` → verify →
  respond and stop. Do not create Milestones, Tasks or Capabilities. If an existing PRD
  needs changes, establish the intended update and follow READ + UPDATE.
- “Save this PRD and break it into a development plan”: resolve Project → inspect
  Resources → create/resolve the PRD Resource → read/analyze its content → read existing
  Milestones and Tasks → use concepts.md to choose meaningful optional phases → reuse
  matches and create only missing Milestones and concrete Tasks → verify. Report the
  Resource created/resolved, Milestones created/reused and Tasks created/reused.
  The Markdown API saves content; Agent reasoning decomposes the plan, not the Worker.
- “Based on this PRD, how should we do it?” authorizes READ and analysis; do not persist
  Milestones or Tasks unless the user explicitly requests writing that plan to Iris.
- “Add a task: design Memory Rules” creates a resolved, deduplicated Task. Later,
  “These are the final Memory Rules; save them” creates/resolves a Markdown Resource.
  Use Task scope only if it is clearly that resolved Task's output; similar names alone
  do not establish the relationship.

## Source of Truth and Next Actions

- Conversation supplies intent and context.
- Iris is the source of truth for current structured state.
- Git and other Resource locations hold durable content; Resource records point to it.

Read Iris for “What Tasks exist?”, “Where is this Project now?”, “Is the Capability work done?”,
and “What should I do next?” Do not answer current-state questions from chat memory alone.

For a Project's next action, read the Project, relevant active Milestones, and Tasks.
Consider `doing` Tasks first, then relevant `todo` Tasks by `position`, using active Milestone
context to assess relevance. Positions are meaningful within their planning groups;
do not assume they establish a unique global priority across Milestones.
Separate recommendations derived from that state from facts explicitly recorded in Iris.
If the records do not establish a clear next action, say so; do not invent an unrecorded one
or persist a recommendation automatically.

## Finance Behavior

Expense records an already incurred Project expense. Finance Settings holds the user's
reporting currency; ExchangeRate is the current FX cache. Each Expense retains its applied
rate and reporting currency. All are structured D1 state, never Git/Markdown memory.

- “DeepUsername 今天 Facebook 花了 120 美元” → resolve Project → Expense CREATE.
- “这个月 DeepUsername 花了多少钱” → Project Expense Summary with resolved month/timezone;
  use server totals and preserve currency groups, not a full download and LLM arithmetic.
- “刚才那笔其实是 120 欧元，不是美元” → read the exact Expense → prepare correct replacement
  → DELETE incorrect Expense → CREATE correct Expense. Currency is immutable; never PATCH it.
  Treat explicit currency correction as replacement intent, not a fallback for arbitrary errors.
  Follow finance-api.md's prechecks and partial-failure handling; replacement is not atomic.
- Missing amount, currency, Project or required time details → resolve reliably or ask;
  never guess financial facts. An ambiguous `$` alone does not establish USD.
- Use current cached FX unless the user supplies an explicit rate. Missing Finance Settings
  requires an explicit reporting-currency choice; never invent rates or silently round input.

## Reminder Behavior

Reminder is a time-based attention schedule, not a Task. ReminderOccurrence is one concrete
execution; a Reminder may have no Project. Do not create a Project just to hold one.
Only explicit scheduling intent authorizes a write. “美元跌到 7 以下提醒我” needs future
Watch/Rule support: do not create a time-based Reminder or promise monitoring.

| User intent | Route |
| --- | --- |
| 明天提醒我提交资料 | CREATE one-time Reminder |
| 每天晚上八点提醒我锻炼 | CREATE recurring Reminder |
| 做完了 (in Reminder context) | DONE current occurrence |
| 晚两个小时 / 明天再提醒我 | DELAY current occurrence |
| 今天算了 | SKIP current occurrence |
| 以后别提醒我了 | CANCEL Reminder |
| 以后都改成晚上九点 | RESCHEDULE via Reminder definition PATCH |

**DELAY != RESCHEDULE; SKIP != CANCEL; DONE != CANCEL.** Never emulate occurrence actions
with status/trigger_at PATCHes. Do not complete a Task merely because an occurrence is DONE.
The Agent converts natural language to absolute datetime, IANA timezone, RRULE or delay-until;
the Worker does not parse natural-language time. Establish the current date for relative time.
Ask for a materially missing time/timezone (e.g. “明天下午”, “晚点”) rather than inventing one;
use unambiguous established context without asking again. Never send natural text in datetime fields.

## Notification and the Async Follow-up Loop

Notification is an immutable durable event, Delivery its actual delivery lifecycle, and Channel
a configured delivery path. Notification is infrastructure, not a general proactive Agent.
There is no public Notification CREATE/PATCH/DELETE or DONE/DELAY/SKIP. Never invent these
endpoints or create arbitrary notifications to “notify the user”. Reminder produces them
through the backend; Watch/Rule and other future sources are not currently supported.

```text
CREATE Reminder → time passes → occurrence due → Notification durable acceptance
→ Delivery → user receives message → follow-up → occurrence DONE / DELAY / SKIP → VERIFY
```

For a follow-up to a Notification:

1. Prefer structured notificationId/sourceType/sourceId/sourceContext already in the conversation.
   Read Notification through notification-api.md only if the needed context is absent.
2. Confirm sourceType is `reminder_occurrence`; otherwise do not dispatch Reminder actions.
   Resolve occurrenceId from sourceId and reminderId from sourceContext.reminderId or an
   independently known exact identity. sourceVersion identifies the trigger generation.
3. Load reminder-api.md; read the exact nested occurrence to validate current state and parent.
   An older notification may reference a previous trigger generation; do not blindly act on it.
   If exact IDs cannot be established (including null sourceContext), or intent is ambiguous, ask.
   Never search title/description to guess an occurrence or substitute the latest occurrence.
4. Apply the user's DONE / DELAY / SKIP to that occurrence, verify, then respond succinctly.
   “明天吧” means DELAY once its target instant is established, not a definition reschedule.

Once durably accepted, the old Notification is not withdrawn by DONE, SKIP, CANCEL,
RESCHEDULE or DELAY; existing delivery attempts can continue. Never promise retraction,
modify/delete the message, or call business actions on Notification itself.

Notification history, delivery success/failure, settings and channels use notification-api.md.
A read-only “为什么通知我” never authorizes changing the source Reminder.
For “为什么没提醒我”, inspect Reminder → Occurrence → Notification → Delivery using only the
two relevant references. Check pending/triggered occurrence state, whether a matching event
exists, and delivery pending/sent/failed. Report what the API establishes; do not blame the
provider without evidence. `sent` is provider-confirmed success, not proof the user read it.

Channels support multiple configured paths: smaller priority runs earlier, with sequential
fallback rather than simultaneous fan-out. Identity is immutable after creation; PATCH only
enabled/priority. Read existing channels before reordering and verify the final order.
Never send secrets through Agent-facing channel APIs. Production adapters are currently absent;
channel names in examples do not establish availability or authorize inventing registrations.

## Progressive Reference Loading

Load only what the present decision needs and reuse already-read context. Routine operations
must not preload all v0.2 references, the aggregate guide, or openapi.json.

| Intent / decision | Load |
| --- | --- |
| Project | [project-api.md](references/project-api.md) |
| Milestone | [milestone-api.md](references/milestone-api.md) |
| Task | [task-api.md](references/task-api.md) |
| Resource metadata | [resource-api.md](references/resource-api.md) |
| Durable Markdown content | [content-api.md](references/content-api.md) |
| Capability | [capability-api.md](references/capability-api.md) |
| Finance / Expense | [finance-api.md](references/finance-api.md) |
| Reminder / scheduling / occurrence actions | [reminder-api.md](references/reminder-api.md) |
| Notification history / deliveries / settings / channels | [notification-api.md](references/notification-api.md) |
| Domain semantics / relationship decisions | [concepts.md](references/concepts.md) |
| Exact detail missing from module, unexpected error, debugging or suspected drift | [openapi.json](references/openapi.json) (relevant sections only) |

The older [api-guide.md](references/api-guide.md) is optional aggregate workflow background,
not a prerequisite for routine module operations. Load local-cache.md only for existing client/cache use.
During maintenance resolve conflicts in this order: implementation/routes/services → OpenAPI
source → generated openapi.json → current module references → old Skill statements.
During operations, use module contracts; unresolved drift stops dependent writes, not speculative requests.

| Example | Minimal loading and action |
| --- | --- |
| DeepUsername 今天花了 $50 买域名 | finance-api; project-api only if unresolved; establish currency before CREATE |
| 明天下午 3 点提醒我开家长会 / 每晚 8 点提醒我锻炼 | reminder-api only; resolve timezone and schedule |
| 明天下午提醒我检查 DeepUsername 广告 | reminder-api + project-api only if needed; clarify time; no notification-api |
| Reminder Notification → 明天吧 / 做完了 / 今天算了 | reminder-api only when source context is present → DELAY / DONE / SKIP; never title search |
| 以后别提醒我锻炼 / 以后都改成晚上九点 | reminder-api → resolve definition → CANCEL / RESCHEDULE |
| 最近通知有没有发送失败的 | notification-api only; distinguish failed Delivery from overall event failure |
| 把 Push 调成 Conduit 的后备 | notification-api only; inspect actual channels before priorities; report unavailable paths |
| 为什么这个提醒没发出来 | reminder-api + notification-api; no Finance/Content docs |
| 美元低于 7 提醒我 | Unsupported Watch/Rule; no Reminder write or unrelated reference loading |

## Error Handling

- Network/reachability failure: stop Iris writes, invalidate readiness, and report unavailability.
  If a write response was lost, its outcome is unknown. After connection recovery and Preflight,
  inspect current state before deciding whether any retry is needed; never blindly repeat creation.
- `400`: check the operation's documented parameters, fields, types, and enums; correct the
  invalid request only within the user's intended change.
- `401`: invalidate readiness and direct the user to check `IRIS_API_TOKEN` in
  `~/.iris/config.env`. Do not request it in chat. Reload the file and repeat Preflight
  when configuration is corrected.
- `404`: the entity may be missing, inaccessible, or outside the specified Project.
  Resolve it again; do not automatically create a replacement.
- `409`: inspect the error and current state for Project slug conflicts or a Resource still
  referenced by a Capability. Do not bypass the constraint.
  For content-specific errors, follow content-api.md.
- `502 CONTENT_PROVIDER_ERROR` or a failed create with unknown outcome: stop dependent writes;
  inspect state before retrying. Do not infer that neither metadata nor content was written.
- Notification errors, immutable snapshots and delivery/settings semantics: follow notification-api.md.
- Reminder errors and terminal/version rules: follow reminder-api.md; never revive completed/cancelled reminders through PATCH.
- Finance errors: follow finance-api.md for missing settings/rates, immutable currency,
  precision and user/Project isolation. Never guess a rate or silently round an invalid amount.
- Other `422`: consult the affected module first; load concepts.md for domain constraints
  or OpenAPI only for missing detail/drift. Do not force a retry.
- Other unexpected failures: preserve uncertainty, consult the documented response definitions,
  and stop dependent writes if success cannot be established. Avoid repeated unchanged retries.

## Current Scope

Supported: Project / Milestone / Task, Resource metadata, durable Markdown CREATE / READ /
UPDATE, Capability registration, Finance settings/current FX/Project Expense CRUD and summary,
time-based Reminder definitions/occurrences/actions, Notification history/delivery reads and
settings/channel management. Notification acceptance and sequential fallback are implemented.

Production channel adapters are still absent; no test adapter is registered in production.
Without a usable channel, occurrences remain pending. Saving a Reminder does not guarantee
external delivery; do not promise exact-to-the-second timing.

Unsupported: Watch/Rule, condition/event monitoring, autonomous notification rules, Reminder
pause/resume, calendar sync, arbitrary Notification POST or message mutation, manual delivery
retry; Income/Account/Balance/Budget/full accounting, historical FX or global expense summary;
arbitrary file management, content deletion/move/rename, Knowledge/RAG, email ingestion,
general Scheduler/Weather/Decision/Personality/Skill Factory, automatic Capability or Cloud Agent
execution. Roadmap descriptions never prove availability.
