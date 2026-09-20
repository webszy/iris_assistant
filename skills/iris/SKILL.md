---
name: iris
description: >-
  Read and maintain structured long-term state in the Iris personal life/work state
  system for Projects, Milestones, Tasks, Resources, and Capabilities. Use when users
  ask about an Iris Project's current status, ongoing work, next actions, or existing
  Tasks, Resources, and Capabilities; request long-term Projects or executable Tasks;
  explicitly report Task starts, completion, or cancellation; change Project,
  Milestone, or Task status; register Resources or Capabilities; or explicitly record
  durable work state in Iris. Do not trigger for general knowledge, translation,
  temporary brainstorming, one-off analysis, programming questions, or conversation
  unrelated to Iris structured state.
---

# Iris

Use Iris to inspect and maintain the current five-entity structured state model.
Apply the protocol below only to the user's Iris-related request.

## Runtime Configuration and Credential Safety

Require `IRIS_API_URL` and `IRIS_API_TOKEN` from environment variables, a runtime
secret store, or secure agent configuration. Use the configured base URL; do not guess
one from repository documentation. OpenAPI specifies no deployment server URL.
Append documented paths to the base URL without duplicating a trailing slash.

Keep both actual configuration values out of this Skill, Markdown, source code,
scripts, Git, Iris Memory, user responses, and logs. Do not hardcode them.
Use runtime references when constructing requests.

For `IRIS_API_TOKEN`, always enforce these rules:

- Never print it or expose it in responses or logs.
- Never persist it outside the approved runtime secret configuration.
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

> `IRIS_API_URL` is not configured. Configure it in the agent runtime/environment and retry.

For a missing token, say:

> `IRIS_API_TOKEN` is not configured. Configure it in the agent runtime secret/environment settings and retry.

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
On `401`, invalidate readiness and ask the user to check the runtime secret configuration;
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

Decide whether the request concerns Iris structured state. If not, answer without Iris calls.
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
Use the common operations in [api-guide.md](references/api-guide.md).
For exact fields, enums, bodies, responses, or errors, consult
[openapi.json](references/openapi.json), the authoritative API specification.
Never invent endpoints, fields, query parameters, enum values, or request structures.
Use JSON bodies only as documented; do not send database field names merely because they
appear in concepts.md. Preserve unrelated values when changing an existing record.

### VERIFY

Verify important mutations: entity creation, Task status transitions, Project archive/unarchive,
Capability enable/disable, Resource creation, Capability registration, and relationship changes.
First inspect the mutation response for the resolved identity, requested values, and relationships.
Use an additional read only when the response does not establish the result; do not mechanically
follow every update with another read.
Distinguish confirmed success, confirmed rejection, and an unknown write outcome.
Never claim a mutation succeeded without supporting response or subsequent state evidence.

### RESPOND

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

Register Resource metadata/location, not the actual long-form content.
Resource kinds are `repository`, `directory`, `file`, `url`;
roles are `context`, `spec`, `artifact`, `reference`.
Consult concepts.md for scope, location requirements, and Milestone/Task relationships;
consult OpenAPI for exact request schemas. Check existing Resources before creating one.

Capability types are `script` and `skill`; every Capability requires a Resource.
Match `script` to a file Resource and `skill` to a directory Resource in the same user/Project scope.
For registration, resolve the Project and an existing compatible Resource first.
Create a Resource only if genuinely absent and needed for the requested registration;
check existing Capabilities before registering the ability.
Do not bypass reference protection: disabled Capabilities still protect their Resources.
Use concepts.md for full integrity rules before changing these relationships.
Registration or enablement does not execute anything; the current API is a registry only.

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

- Read [concepts.md](references/concepts.md) for Project vs Task, optional Milestones,
  Resource modeling/scope/location, domain relationships, and Capability → Resource constraints.
- Read [api-guide.md](references/api-guide.md) for common operations and workflows:
  inspect Project work, create/update/complete Tasks, attach Resources, register Capabilities,
  archive/unarchive Projects, and enable/disable Capabilities. Do not duplicate its workflows here.
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
- `401`: invalidate readiness and direct the user to check `IRIS_API_TOKEN` in runtime secret
  settings. Do not request it in chat. Repeat Preflight when configuration is corrected.
- `404`: the entity may be missing, inaccessible, or outside the specified Project.
  Resolve it again; do not automatically create a replacement.
- `409`: inspect the error and current state for Project slug conflicts or a Resource still
  referenced by a Capability. Do not bypass the constraint.
- `422`: recheck concepts.md, api-guide.md, and the relevant OpenAPI definitions for invalid
  Resource scope/location or incompatible Capability/Resource kinds. Do not force a retry.
- Other unexpected failures: preserve uncertainty, consult the documented response definitions,
  and stop dependent writes if success cannot be established. Avoid repeated unchanged retries.

## Current Scope

Support only Projects, Milestones, Tasks, Resources, and Capabilities.
Do not claim support for Reminder, Scheduler, Finance, Weather, Rules, Knowledge, Decision,
Personality, Skill Factory, automatic Capability execution, or Cloud Agent execution.
Do not treat roadmap documentation as evidence that these features are available.
