---
name: iris
description: >-
  Manage persistent structured work/life state and durable project memory in Iris:
  Projects, Milestones, Tasks, Resources, Capabilities, Markdown Resource Content,
  and Finance / Project Expense Tracking.
  Use for Iris status/next-action queries, explicit state changes, Resource/Capability
  registration, saving PRDs, specs, design documents or long-term notes, and reading
  or editing existing Iris Markdown, recording Project expenses and querying costs. Do not trigger for ordinary translation,
  knowledge questions, temporary analysis, or undecided brainstorming.
---

# Iris

Use Iris to inspect and maintain structured state and durable Markdown content.
Apply the protocol below only to the user's Iris-related request.

## Execute the Request, Then Explain the Data

For a concrete Iris query or operation, use this Skill as operating instructions,
not as material to review. Perform the required Preflight, reads, target resolution,
and authorized operation, then explain the retrieved data or verified result.
Do not replace execution with an evaluation, summary, critique, or redesign of this
Skill, the Iris architecture, or its domain model. Discuss those topics only when
the user explicitly asks for that analysis. Merely loading or receiving the Skill
alongside an operational request is not a request to evaluate it.

Keep routine protocol interpretation internal. A brief action-oriented progress
message is enough when needed; do not open with a lengthy analysis of the Skill,
an unsolicited development plan, or an architecture assessment. If only the Skill
is supplied with no actionable request, ask what the user wants to do in Iris.

Execution-first does not bypass missing-target stops, Project-name requirements,
duplicate checks, user authorization, credential safety, or result verification.
When blocked, state the specific blocker and ask only for the missing information
needed to proceed. Do not make speculative writes or claim execution without tools.

Examples:

- “List Iris tasks” → read current Iris state and report the tasks and statuses;
  do not discuss whether the Task model is well designed.
- “Add task Y to Project X” → resolve X, check duplicates, create when authorized,
  and report the verified result; if X is missing, ask for clarification instead.
- “Review this Iris Skill's design” → provide the requested analysis without
  triggering Iris operations merely because the Skill was loaded.

## Runtime Configuration and Credential Safety

Load both `IRIS_API_URL` and `IRIS_API_TOKEN` from `~/.iris/config.env` before
Iris operations, then pass them through the runtime environment to requests and the
local content client. This file is the approved local secret configuration (directory
permission `700`, file permission `600`); do not display its contents. Do not silently
fall back to previously exported values if the file or either setting is missing.
In a shell, load it in the same process that runs the request/client:

```sh
set +x
unset IRIS_API_URL IRIS_API_TOKEN
set -a
. "$HOME/.iris/config.env" || exit 1
set +a
```

Stop if loading fails. The `auth:create-remote` script interactively asks for the
API URL before generating a Token or creating a remote user. Empty or invalid input
aborts creation; successful remote verification writes both values to this file.
Do not run that creation command automatically to repair missing configuration:
each run creates a new remote user and Token.

Use the configured base URL; do not guess
one from repository documentation. OpenAPI specifies no deployment server URL.
Append documented paths to the base URL without duplicating a trailing slash.

Keep both actual configuration values out of this Skill, Markdown, source code,
scripts, Git, Iris Memory, user responses, and logs. Do not hardcode them.
Use runtime references when constructing requests.

For `IRIS_API_TOKEN`, always enforce these rules:

- Never print it or expose it in responses or logs.
- Never persist it outside the approved local secret file `~/.iris/config.env`.
- Never commit it to Git, write it into Markdown, or store it in Iris.
- Never ask the user to paste it into normal conversation.
- Use the runtime secret value directly when authenticating requests.
- Avoid shell tracing, verbose credential output, and command logging that exposes
  Authorization headers. Do not dump the environment or expanded request commands.
- Provide technical details only with credentials and actual configuration values redacted.

## Preflight

Run Preflight only when the current request actually requires Iris access.
Loading this Skill alone must not trigger network calls.

Run it before the first Iris operation in the current task/session. After success,
reuse readiness in that running context; do not repeat it for every API request.
Repeat after the base URL changes, authentication or connection fails, credentials
are replaced, or the previous connection state is otherwise known to be invalid.
Keep readiness only in the current runtime context, never in D1 or Memory.

### 1. Validate runtime configuration

Check presence without printing values. If either value is absent, stop Iris operations.
For a missing URL, say:

> `IRIS_API_URL` is missing. Configure it in `~/.iris/config.env` and retry.

For a missing token, say:

> `IRIS_API_TOKEN` is missing. Configure it securely in `~/.iris/config.env` and retry.

Do not request the token in chat.

### 2. Check reachability

Call `GET /health` at `$IRIS_API_URL/health` without a Bearer token.
Require the documented `200` success response with `success: true` and `data.status: ok`.
If it fails, stop Iris reads and writes and report that the Iris API is currently
unreachable or its health check failed. Do not diagnose this as a token error.

### 3. Check authentication

Call `GET /api/v1/test` at `$IRIS_API_URL/api/v1/test` with:

```http
Authorization: Bearer $IRIS_API_TOKEN
```

Require the documented `200` success response with `success: true`.
Only after both checks succeed, mark Iris ready for this task/session.
On `401`, invalidate readiness and ask the user to check `~/.iris/config.env`;
the token may be missing, invalid, revoked, or expired. Never echo it.
On any other failure, leave readiness unset and report the failed check without guessing its cause.
Do not dynamically search for alternative Preflight endpoints.

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

**Read before write.** Read current Iris state before creating or modifying long-term records.
Use conversation history to understand intent, never as a substitute for current API state.
Do not write from model memory, guessed state, or a remembered ID without resolving its current record.

For “Capability is finished,” resolve the Project and inspect relevant Tasks first.
Determine whether the user means an implementation Task or a Capability registration;
do not mark an unrelated Task complete or equate registration with completed work.

### RESOLVE

Resolve Projects, Milestones, Tasks, Resources, and Capabilities through their documented
list/read operations. Use actual IDs returned by Iris.
Never invent IDs, fabricate entity existence, or assume a natural-language name is unique.
Resolve the owning Project and relevant child relationships before mutation.
If several plausible candidates remain, ask a focused clarification before choosing a write target.
A missing entity is not permission to create it.

**Missing named target is a hard stop.** If a Project explicitly named by the user,
or a Task referenced as an existing record, cannot be resolved, report what was not
found and ask the user to confirm the intended target or explicitly authorize creation.
Until that clarification arrives, do not create any Project or Task or perform other
dependent writes for that request. Do not substitute the current workspace's Project,
another available Project, or a similarly named record. Similar matches may be offered
as candidates only; they are not confirmed targets. Silence is not confirmation.

**Insistence does not supply a Project name.** If the user insists on creation
(for example, “force create it” or “just create it anyway”), require an explicit
Project name supplied or unambiguously confirmed by the user in this request's context.
If none is established, ask the user to specify the Project name and refuse creation
until they do. Never invent a name or infer it from the workspace or available Projects.
A Project name already explicitly established need not be requested again.
For Task creation, resolve that Project first. If it does not exist, require explicit
authorization to create that named Project as well; insistence on creating a Task alone
does not authorize Project creation. Check for duplicates before authorized creation.

Distinguish a reference to an existing Task from the title of an explicitly requested
new Task. “Add a new task Y to Project X” authorizes creation of Y only after X is
resolved and duplicate checks pass; Y being new does not itself require confirmation.
“Mark task Y complete” does not authorize creating Y if it cannot be found.
After clarification, resolve the confirmed target from current Iris state and apply
duplicate checks before any authorized creation; confirmation does not justify guessed IDs.

Examples:

- “Just force-create it,” with no explicit Project name established → ask “Which
  Project should this belong to? Please specify the Project name.” Create nothing;
  if the user refuses to name a Project, refuse creation.
- “Add task Y to Project X,” but X is missing → report X not found and ask for
  clarification; create neither X nor Y, and do not add Y to another Project.
- “Start task Y in Project X,” but Y is missing → report Y not found and ask for
  clarification; do not create a replacement Task or change a similar Task.
- “Use Project Z instead” → resolve Z and check its Tasks before continuing the
  previously requested task creation; do not create Z if it is also missing.
- “Add a new task Y to Project X,” with X resolved and no duplicate → create Y
  using the documented fields; no extra confirmation is needed merely because Y is new.

### DECIDE

Determine whether the user intends a state change, which entity fits, whether it already
exists, and whether to reuse, update, or create it. Prefer updating existing state to
creating duplicates when they represent the same work and the requested change is clear.
If the requested state is already present, report that result without an unnecessary write.
Proceed with a clearly requested change once the entity and intended outcome are resolved;
ask only when missing information would change the target or meaning.

**Do not turn conversation into structured state indiscriminately.**
Record explicit long-term Projects, executable Tasks, meaningful Milestones, durable Resources,
reusable Capabilities, and clear status changes when the user intends to record them.
Do not automatically record casual comments, emotions, vague plans, undecided brainstorms,
knowledge questions, or one-off translations.

“This logo looks pretty good” creates no Task.
“Add a task to replace the logo tomorrow” can justify a Task in a resolved Project.
Current Task schemas have no scheduling or due-date field: preserve intended timing only as
ordinary Task text when appropriate, and disclose that no reminder or schedule was created.
If scheduling is essential to the request, explain the limitation rather than claiming success.

### WRITE

Write only the state change established in DECIDE and authorized by the user's intent.
For Finance, use [finance-api.md](references/finance-api.md); add
[project-api.md](references/project-api.md) only when Project resolution is needed.
For existing non-Finance workflows, use the common operations in [api-guide.md](references/api-guide.md).
For exact fields, enums, bodies, responses, unexpected errors or documentation drift, consult
[openapi.json](references/openapi.json), the authoritative API specification.
Never invent endpoints, fields, query parameters, enum values, or request structures.
Use JSON bodies only as documented; do not send database field names merely because they
appear in concepts.md. Preserve unrelated values when changing an existing record.

### VERIFY

Verify important mutations: FinanceSettings updates, Expense creation/update/deletion,
entity creation, Task status transitions, Project archive/unarchive,
Capability enable/disable, Resource creation, Capability registration, and relationship changes.
First inspect the mutation response for the resolved identity, requested values, and relationships.
Use an additional read only when the response does not establish the result; do not mechanically
follow every update with another read.
Distinguish confirmed success, confirmed rejection, and an unknown write outcome.
Never claim a mutation succeeded without supporting response or subsequent state evidence.

### RESPOND

Lead with the requested data, verified outcome, or concrete blocker, in the user's
language. For creation, report the owning Project, title/name, and confirmed status
when applicable; for queries, answer from returned records. Keep explanations tied
to those results. Omit unsolicited commentary on the Skill or Iris architecture.
Summarize what was found, what changed, the confirmed current state, and any useful next step.
State when nothing needed changing or when a requested result could not be verified.
Avoid raw headers, request dumps, large JSON responses, and debug logs by default.
If technical details are requested, keep them relevant and redact credentials in every case.

## Entity Decisions and Duplicate Prevention

Use these short cues; read [concepts.md](references/concepts.md) for ambiguity or domain constraints.

| Intent | Entity |
| ------ | ------ |
| Long-running context | Project |
| Meaningful project phase | Milestone |
| Concrete executable work | Task |
| Durable file, directory, repository, or URL | Resource |
| Reusable executable ability | Capability backed by a Resource |

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
Use only the Project/Milestone statuses in OpenAPI; archive is separate from Project status.

### New Project README initialization

When the user authorizes a new Project, initialize its durable project context as part
of the same Agent workflow, unless the user explicitly excludes README creation.
After Project duplicate checks and successful creation, use the returned Project ID to
inspect its Resources and create a project-scoped Markdown Resource through Iris.
Use `path=README.md`, `name=README.md`, and `role=context`; omit child scope IDs.
Load api-guide.md for the exact requests. This creates a file in the server-configured
content repository, not a new repository or a shared repository-root README. Do not
construct a physical path or operate Git directly.

Use the user's supplied README text if provided. Otherwise write a minimal Markdown
heading with the confirmed Project name and its confirmed description, when available,
in the user's language. A name-only heading is sufficient when no description exists.
Do not invent plans, requirements or background, or create Tasks, Milestones or Capabilities.

Check for an existing README Resource before CREATE, including when resuming a partially
completed initialization. Read a matching file Resource to verify it and reuse it without
overwriting. Follow Content failures for missing content, ambiguous matches or
`CONTENT_ALREADY_EXISTS`; never randomly rename the README or blindly retry creation.
Merely resolving an older Project does not authorize retroactive README initialization.

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

Complete a resolved Task with `PATCH /api/v1/projects/{projectId}/tasks/{taskId}`
and body `{"status":"completed"}`. There is no separate completion action to invent.
Let the server manage completion time. Never write a fabricated `completed_at`, or treat
`updated_at` as completion time. Consult the references for exact field representations.
Keep long-form output in durable material referenced by Resources, not in Task descriptions.

### Resources and Capabilities

Resource records store metadata/location; use the Resource Content API to save long-term
Markdown, create PRD/spec files, read Resource contents or edit durable Memory.
Resource kinds are `repository`, `directory`, `file`, `url`;
roles are `context`, `spec`, `artifact`, `reference`.
Consult concepts.md for scope, location requirements, and Milestone/Task relationships;
consult OpenAPI for exact request schemas. Check existing Resources before creating one.

For Markdown CREATE / READ / UPDATE, follow the durable-content workflow below and
load api-guide.md for endpoints and fields. Ordinary Resource POST registers a pointer;
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

The Agent calls only Iris APIs. Provider credentials and physical storage mapping belong
to the Iris server; never operate the repository directly or request provider secrets.
Only `IRIS_API_URL` and `IRIS_API_TOKEN` are required in the Agent runtime.

### Local content client

Markdown Resource content operations should use the bundled
`scripts/iris-content.mjs` local Iris content client when available (Node.js 18+).
Read [local-cache.md](references/local-cache.md) for commands, JSON file/stdin input and
optional `IRIS_CACHE_DIR` / `IRIS_CACHE_TTL_SECONDS` configuration. Do not manually manage
cache files. Normal GET uses a validated local snapshot for up to 300 seconds by default.
Use `get --refresh` for “latest”, “read again”, known/suspected changes, conflict recovery
and post-write verification. Do not describe a cached read as freshly verified server state.

PUT always goes to Iris with `expected_revision`; the cached revision is only a previously
observed version, never concurrency authority. Successful PUT and CONTENT_CONFLICT clear
the cache; no write-through occurs. After conflict: invalidate → force-refresh GET →
reconcile → retry only if safe. CREATE success, Resource locator PATCH and Resource DELETE
also invalidate through the client. If an operation must use raw Iris APIs instead, call
the client's `invalidate` command for the same events, including uncertain write outcomes.
Cache errors fall back to API; API errors must not fall back to expired content. On an
invalidation warning, force-refresh later reads until local permissions are repaired.

Local cache is only a temporary copy. Iris API / GitHub remains durable content truth,
D1 remains operational state, and conversation supplies intent/context. Different Agents
may have independent caches; consistency relies on server revision checks, not cache sync.
Keep Preflight and target resolution unchanged; the client does not perform them for you.
When switching Iris accounts on one local OS profile, clear the previous cache or select
a separate cache directory before reading; tokens are deliberately excluded from cache keys.

### Choose role and scope

Use `spec` for PRDs, formal specifications and technical designs; `artifact` for durable
project outputs; `context` for long-term background needed to understand work; `reference`
for external or supporting material. Read concepts.md when ambiguous; invent no roles.
Use Project scope for project-wide or cross-phase material. Use Milestone or Task scope
only when the content clearly belongs there, after resolving that entity. Do not attach
it to a child merely because it might be useful later or its name sounds related.

### Create, read and update

- **CREATE:** resolve Project → read existing Resources → compare document meaning,
  location and scope → create only genuinely new content → verify Resource identity,
  role/scope and returned content metadata. Read candidate content when metadata cannot
  establish whether it is the same document. Reuse an existing document when appropriate;
  saving a new document never authorizes overwriting a matching file.
- Submit only a Project-relative path such as `specs/v0.1-prd.md`,
  `research/provider-analysis.md` or `notes/architecture.md`. Never construct
  `projects/<project-id>/...`, derive storage paths from IDs, or copy a returned physical
  path into CREATE. The server owns physical mapping.
- **READ:** resolve Project → resolve Resource → GET Resource content → answer from the
  returned `content`. Resource metadata is not Resource content. Never infer the document
  from its name/path or substitute chat memory when summarizing or answering about it.
- **UPDATE:** resolve Project and Resource → GET current content and revision → apply
  the intended change → PUT the updated content with that `expected_revision` → verify.
  **Never update Markdown content without first reading the current revision.**
  **Prefer minimal edits over whole-document rewrites.** Even though PUT submits full
  text, preserve unrelated sections, wording, structure and formatting unless the user
  explicitly requests a rewrite. Inspect the success metadata; GET again when needed to
  verify actual text, since CREATE/PUT responses omit the body. Do not use Resource
  `updatedAt` as proof of a content update.

### Content failures

- `CONTENT_CONFLICT`: invalidate local cache; do not claim success or retry the old revision. Force-refresh GET the latest
  content, compare it with the previously read content and the user's intended edit,
  and reapply only if safe, using the latest revision. If changes conflict semantically
  or could overwrite another person's edits, stop, explain the conflict and request
  confirmation. Never use last-write-wins or blind retries.
- `CONTENT_ALREADY_EXISTS`: do not overwrite, randomly rename or immediately repeat
  CREATE. Re-read Resources and resolve the existing file/Resource. For an intended
  modification, use READ + UPDATE; for a genuinely different document, choose a clear,
  distinct path before CREATE. Ask when intent is ambiguous. If no pointer can be
  resolved, report the gap; do not guess storage details or bypass Iris to repair it.
- `CONTENT_NOT_FOUND`: say “Resource pointer exists, but its underlying content is
  missing.” Do not treat it as empty, automatically create content or delete metadata.
  Suggest checking or rebinding the Resource when appropriate.
- `CONTENT_TOO_LARGE`: explain that the Resource exceeds the Content API's supported
  size. Do not repeatedly retry or truncate it and write it back.
- `RESOURCE_CONTENT_UNSUPPORTED`: explain that this is not a supported Markdown file
  Resource. Do not bypass Iris to read or write the provider directly.
- `CONTENT_PROVIDER_ERROR`: report an Iris content-provider failure, never success.
  Stop dependent writes; inspect current state after recovery before retrying an unknown
  write outcome. Never request or expose provider credentials.

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

## Progressive Reference Loading

Load only what the present decision requires; reuse already-read reference context.

- Finance / Expense operations → [finance-api.md](references/finance-api.md).
  Add [project-api.md](references/project-api.md) only for Project resolution.
  Do not automatically load api-guide.md, concepts.md, content/resource/capability references,
  or openapi.json for Finance. OpenAPI is for exact schema, unexpected errors, debugging or drift.
  Finance records stay in D1: never create a Markdown Resource or mirror expenses to iris-memory.
  Do not create a Project merely because an expense mentions one; preserve missing-target rules.
  For cost questions use Project Expense Summary, not a full expense download and LLM arithmetic.
  Use current cached FX automatically; an explicit user rate wins. Missing settings require an
  explicit reporting-currency choice. Currency cannot be PATCHed; changing it requires an
  authorized delete and replacement, never an automatic workaround.
- Read [concepts.md](references/concepts.md) for Project vs Task, optional Milestones,
  Resource role/scope/location, Markdown ownership, domain relationships, and Capability → Resource constraints.
- Read [api-guide.md](references/api-guide.md) for common operations and workflows:
  inspect Project work, create/update/complete Tasks, attach Resources, register Capabilities,
  archive/unarchive Projects, enable/disable Capabilities, Markdown CREATE / READ / UPDATE,
  and content error handling.
- Read [local-cache.md](references/local-cache.md) when invoking the bundled content client,
  selecting refresh, invalidating after mutations, or diagnosing local cache failures.
- Read relevant sections of [openapi.json](references/openapi.json) when exact endpoints,
  parameters, request/response schemas, enums, errors, or operations absent from the guide are needed.
  Do not load the entire specification for every simple operation already covered by the guide.

Resolve API facts using OpenAPI and domain semantics using concepts.md.
The guide is an operational shortcut, not an overriding specification.
OpenAPI's Resource location matrix is incomplete; use the implementation-verified domain rules
in concepts.md without inventing additional request fields. Report any unresolved conflict
that affects the intended operation and stop the dependent write rather than guessing.

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
  For content-specific errors, follow Content failures above.
- `502 CONTENT_PROVIDER_ERROR` or a failed create with unknown outcome: stop dependent writes;
  inspect state before retrying. Do not infer that neither metadata nor content was written.
- Finance errors: follow finance-api.md for missing settings/rates, immutable currency,
  precision and user/Project isolation. Never guess a rate or silently round an invalid amount.
- Non-Finance `422`: recheck concepts.md, api-guide.md, and the relevant OpenAPI definitions for invalid
  Resource scope/location or incompatible Capability/Resource kinds. Do not force a retry.
- Other unexpected failures: preserve uncertainty, consult the documented response definitions,
  and stop dependent writes if success cannot be established. Avoid repeated unchanged retries.

## Current Scope

Support only Projects, Milestones, Tasks, Resources, Capabilities, Markdown Resource
CREATE / READ / UPDATE, and Finance Phase 1: explicit settings, read-only current FX,
Project Expense CRUD and Project Expense Summary. Finance is structured D1 state;
no Income, Account, Balance, Budget, historical FX, global expense summary or autonomous Finance behavior.
No arbitrary file management, content deletion, move/rename,
Knowledge/RAG, notifications or email.
The internal daily FX cron is not a user-facing Scheduler or Reminder feature.
Do not claim support for Reminder, Scheduler, Weather, Rules, Knowledge, Decision,
Personality, Skill Factory, automatic Capability execution, or Cloud Agent execution.
Do not treat roadmap documentation as evidence that these features are available.
