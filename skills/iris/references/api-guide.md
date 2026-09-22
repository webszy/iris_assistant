# Iris API Quick Guide

## 1. Source of Truth

- This file is a quick operational guide.
- `openapi.json` is the authoritative API specification (Iris API, version `0.1.0`).
- If this guide and OpenAPI differ, follow `openapi.json`.

**Reference status:** `openapi.json` has been regenerated from the current source (18 paths,
30 operations, 43 schemas) and includes the Markdown Content operations below. After any route
or schema change, regenerate it from the repository root with `pnpm run openapi:export` and
verify the result with `pnpm run openapi:check`. Before operational writes, check the target
deployment's `/openapi.json`; a source change does not imply the deployment supports it yet.

## 2. Connection

Base URL: use `IRIS_API_URL` in the examples below.
The current OpenAPI has no `servers` entry and specifies no deployment URL.
Supply the deployment base URL through the runtime environment; do not guess it.
For these examples, omit a trailing slash and append the exact paths shown below.
`IRIS_API_URL` is this guide's runtime convention, not an OpenAPI-defined variable.

## 3. Authentication

OpenAPI defines `bearerAuth` as HTTP Bearer authentication.
All Project, Milestone, Task, Resource, and Capability operations require it:

```http
Authorization: Bearer $IRIS_API_TOKEN
```

- Read the token from the runtime secret/environment (`IRIS_API_TOKEN` in examples).
- Token value must never be stored in SKILL.md.
- Token value must never be committed to Git.
- Never print or expose it in responses or logs; avoid shell tracing and verbose HTTP output.
- `GET /health` is public; `GET /api/v1/test` checks authentication.

## 4. General API Rules

- Read before write. Resolve IDs from previous API responses; never invent IDs.
- Replace `{projectId}`, `{milestoneId}`, `{taskId}`, `{resourceId}`, and `{capabilityId}` with resolved IDs.
- Read the existing entity before updating it; use exact OpenAPI enum values.
- Send JSON bodies with `Content-Type: application/json` where a body is specified.
- Create/update schemas reject additional properties. Send only documented writable fields.
- Nested routes identify the Project in the URL; do not add `project_id` to their bodies.
- Request fields such as `milestone_id`, `task_id`, and `resource_id` use snake_case;
  returned fields use `milestoneId`, `taskId`, and `resourceId`.
- Core list responses contain `{ "success": true, "data": [...] }`; item responses contain
  `{ "success": true, "data": { ... } }`. Resource deletion returns no body.
- Treat `404` as not found or not accessible within the current user/Project scope.

## 5. Core Resource Map

| Entity | List | Create | Read | Update | Special actions |
| ------ | ---- | ------ | ---- | ------ | --------------- |
| Project | GET /api/v1/projects | POST /api/v1/projects | GET /api/v1/projects/{projectId} | PATCH /api/v1/projects/{projectId} | POST /api/v1/projects/{projectId}/archive; POST /api/v1/projects/{projectId}/unarchive |
| Milestone | GET /api/v1/projects/{projectId}/milestones | POST /api/v1/projects/{projectId}/milestones | GET /api/v1/projects/{projectId}/milestones/{milestoneId} | PATCH /api/v1/projects/{projectId}/milestones/{milestoneId} | — |
| Task | GET /api/v1/projects/{projectId}/tasks | POST /api/v1/projects/{projectId}/tasks | GET /api/v1/projects/{projectId}/tasks/{taskId} | PATCH /api/v1/projects/{projectId}/tasks/{taskId} | — |
| Resource | GET /api/v1/projects/{projectId}/resources | POST /api/v1/projects/{projectId}/resources | GET /api/v1/projects/{projectId}/resources/{resourceId} | PATCH /api/v1/projects/{projectId}/resources/{resourceId} | DELETE /api/v1/projects/{projectId}/resources/{resourceId} |
| Capability | GET /api/v1/projects/{projectId}/capabilities | POST /api/v1/projects/{projectId}/capabilities | GET /api/v1/projects/{projectId}/capabilities/{capabilityId} | PATCH /api/v1/projects/{projectId}/capabilities/{capabilityId} | POST /api/v1/projects/{projectId}/capabilities/{capabilityId}/enable; POST /api/v1/projects/{projectId}/capabilities/{capabilityId}/disable |

## 6. Projects

- List: `GET /api/v1/projects`.
  Optional query: `status`, `kind`, `include_archived` (`true` or `false` strings).
  Archived Projects are excluded by default; `include_archived=true` includes them.
  Results are ordered by creation time descending, without pagination.
- Create: `POST /api/v1/projects`.
  Required body fields: `name`, `slug`.
  Optional: `description`, `kind`, `status`.
- Read: `GET /api/v1/projects/{projectId}`.
- Update: `PATCH /api/v1/projects/{projectId}`.
  Writable body fields (all optional): `name`, `slug`, `description`, `kind`, `status`.
- Archive: `POST /api/v1/projects/{projectId}/archive`.
- Unarchive: `POST /api/v1/projects/{projectId}/unarchive`.
  Both actions are idempotent and specify no request body. Do not PATCH archive timestamps.

`name` must be nonempty; `slug` must match `^[a-z0-9-]+$`.
`description` may be null.
`kind`: `product`, `operation`, `automation`, `personal`, `content`, `other`.
`status`: `planned`, `active`, `paused`, `completed`.
Create returns `201`; list/read/update/archive/unarchive return `200`.

## 7. Milestones

Milestone operations are nested under the Project identified by `{projectId}`.

- List: `GET /api/v1/projects/{projectId}/milestones`.
  Optional query: `status`. Results are ordered by `position` ascending.
- Create: `POST /api/v1/projects/{projectId}/milestones`.
  Required body fields: `name`.
  Optional: `description`, `status`, `position`.
  Omitted `position` uses the Project's current maximum + 100.
- Read: `GET /api/v1/projects/{projectId}/milestones/{milestoneId}`.
- Update: `PATCH /api/v1/projects/{projectId}/milestones/{milestoneId}`.
  Writable body fields (all optional): `name`, `description`, `status`, `position`.

`name` must be nonempty; `description` may be null; `position` is an integer.
`status`: `planned`, `active`, `completed`, `cancelled`.
There is no Milestone delete route; use `status = cancelled` for a discarded phase.
Create returns `201`; list/read/update return `200`.

## 8. Tasks

- List Project tasks: `GET /api/v1/projects/{projectId}/tasks`.
  Optional query: `status`, `milestone_id` (a nonempty ID belonging to this Project).
  Results default to `position` ascending.
- Create: `POST /api/v1/projects/{projectId}/tasks`.
  Required body fields: `title`.
  Optional: `milestone_id`, `description`, `status`, `position`.
- Read: `GET /api/v1/projects/{projectId}/tasks/{taskId}`.
- Update/change status: `PATCH /api/v1/projects/{projectId}/tasks/{taskId}`.
  Writable body fields (all optional): `milestone_id`, `title`, `description`, `status`, `position`.

`title` must be nonempty; `milestone_id` may be null or a nonempty string;
`description` may be null; `position` is an integer.
`status`: `todo`, `doing`, `completed`, `cancelled`.

To complete a task, PATCH the task with `{"status":"completed"}`.
Entering `completed` sets the completion timestamp; leaving it clears the timestamp;
patching `completed` to `completed` preserves it. The response field is `completedAt`.
Creating a task with `status = completed` also sets the timestamp.
There is no Task delete route. Create returns `201`; list/read/update return `200`.

## 9. Resources

- List: `GET /api/v1/projects/{projectId}/resources`.
  Optional query: `kind`, `role`, `milestone_id`, `task_id` (ID filters are nonempty strings).
- Create: `POST /api/v1/projects/{projectId}/resources`.
  Required body fields: `name`, `kind`, `role`.
  Optional schema fields: `milestone_id`, `task_id`, `repository`, `path`, `url`.
  Location requirements also depend on `kind`; see the specification gap below.
- Read: `GET /api/v1/projects/{projectId}/resources/{resourceId}`.
- Update: `PATCH /api/v1/projects/{projectId}/resources/{resourceId}`.
  Writable body fields (all optional): `name`, `kind`, `role`, `milestone_id`, `task_id`, `repository`, `path`, `url`.
- Delete: `DELETE /api/v1/projects/{projectId}/resources/{resourceId}`.
  Success is `204` with no body. Create returns `201`; list/read/update return `200`.

`kind`: `repository`, `directory`, `file`, `url`.
`role`: `context`, `spec`, `artifact`, `reference`.
`name` must be nonempty. The optional ID/location fields accept null or nonempty strings.

The create operation states that `milestone_id` and `task_id` are mutually exclusive,
and `kind` determines required combinations of `repository`, `path`, and `url`.
**Specification gap:** the current OpenAPI does not enumerate those location combinations;
do not infer a complete validation matrix from the optional properties alone.
For the current server-side Resource location rules verified from implementation, see `concepts.md`.
See `openapi.json` for the full request schema and operation descriptions.

Updates revalidate the merged record's scope, location, and references.
A kind change that breaks an existing Capability relationship returns `422` without writing.
These ordinary Resource operations handle metadata; creation does not access Git or URL contents.
PATCH changes/rebinds pointers only; it never moves, renames, creates or deletes the material.
Deletion removes only Iris metadata, not Git files or URL contents, and does not call GitHub.
A Resource referenced by any Capability, including a disabled one, cannot be deleted (`409`).

### Markdown Resource Content

Use the bundled `scripts/iris-content.mjs` client for these operations when available;
see [local-cache.md](local-cache.md) for CLI commands and JSON input. GET normally uses
the local TTL cache; explicit latest/refresh requests and post-write verification use
`get --refresh`. PUT remains server-authoritative and invalidates on success/conflict.
CREATE, locator Resource PATCH and Resource DELETE also invalidate via the client;
when using raw API calls, invoke its `invalidate` command for those same events.
The table below describes the unchanged server contract; the client GET returns only
resourceId/content/revision/sizeBytes on both hits and misses. Cache is temporary, not truth.

| Operation | Endpoint | Request | Success |
| --- | --- | --- | --- |
| Create new Markdown + Resource | `POST /api/v1/projects/{projectId}/resources/markdown` | Required: `name`, `path`, `role`, `content`. Optional: `milestone_id`, `task_id`, `commit_message`. | `201`, `data.resource` and `data.content` metadata |
| Read full Markdown | `GET /api/v1/projects/{projectId}/resources/{resourceId}/content` | No body | `200`, `data` includes full `content`, `revision`, `sizeBytes` |
| Replace full Markdown | `PUT /api/v1/projects/{projectId}/resources/{resourceId}/content` | Required: `content`, `expected_revision`. Optional: `commit_message`. | `200`, `data` contains content metadata |

Create `path` is Project-relative, e.g. `specs/prd.md`. The server maps it to storage;
do not construct a physical prefix from the Project ID or reuse returned physical paths
as CREATE input.
Paths must be canonical POSIX paths ending in lowercase `.md` or `.markdown`. Absolute
paths, backslashes, null/control bytes, dot/parent/empty segments, duplicate or trailing
slashes are rejected; hidden directories and names such as `skills/` are allowed.
The logical repository, kind, user and Project are server-controlled. Child scope IDs
remain mutually exclusive and must belong to the same user and Project.

All three operations require the existing Bearer authentication. Content reads/updates
require `kind=file`, the configured logical repository and a valid path inside the current
Project namespace managed by the server. Ordinary POST may register existing files; multiple Resources may
reference the same file and share its revision. Markdown CREATE only creates a new file:
existing physical content returns `409 CONTENT_ALREADY_EXISTS`, even after metadata deletion.
An existing pointer whose physical file is absent does not itself block Markdown CREATE.

Content is preserved as UTF-8 text, including empty content, BOM and CRLF/LF; no formatting
or newline normalization. CREATE/READ/UPDATE permit up to **5 MiB (5242880 UTF-8 bytes)**.
Larger content returns `413 CONTENT_TOO_LARGE`. `commit_message` is trimmed, must be nonempty
and at most 200 Unicode code points. Defaults are `Add <name>` / `Update <name>`, safely
truncated; the Resource name itself is unchanged.

Metadata responses contain `resourceId`, `repository` (logical alias), `path`,
`contentType: text/markdown`, `revision`, `sizeBytes`. CREATE/PUT omit the content body.
PUT changes neither Resource metadata nor `updatedAt`.

Treat `revision` as an opaque content revision. GET before UPDATE; pass the revision
from the content you actually edited as `expected_revision`. Identical text can retain
its revision, including A→B→A; even identical submitted text must pass the revision check.
There is no server merge or silent latest-version retry.

Typical Agent workflows:

1. **Create:** resolve Project → list Resources and compare meaning/path/scope → read
   plausible matches when needed → POST new Markdown only if absent → verify
   `data.resource` identity/role/scope and `data.content` metadata.
2. **Read:** resolve Project and Resource → GET content → answer from `data.content`,
   never from metadata or chat memory alone.
3. **Update:** resolve Project and Resource → GET content/revision → minimally edit the
   current text → PUT full `content` plus `expected_revision` → verify returned identity
   and revision. Preserve unrelated text and formatting. GET again when text verification
   is needed; CREATE/PUT do not return the body, and `updatedAt` does not track content.

| Error | Agent action |
| --- | --- |
| `409 CONTENT_ALREADY_EXISTS` | Re-list Resources and resolve the existing document. No overwrite, random rename or immediate POST retry. If the user intends an edit, READ + UPDATE; if it is a distinct document, choose a clear new path; clarify ambiguity. If no Resource resolves, report the pointer gap rather than guessing physical storage details. |
| `409 CONTENT_CONFLICT` | Do not claim success. GET latest content, compare the original and intended edit, and safely reapply with the latest revision. Stop and ask for confirmation on semantic conflicts or possible loss of others' edits. No old-revision retry or last-write-wins. |
| `404 CONTENT_NOT_FOUND` | Resource pointer exists, but its underlying content is missing. Do not assume empty content, recreate it or delete metadata. Suggest checking/rebinding the pointer. |
| `413 CONTENT_TOO_LARGE` | Report the 5 MiB limit; do not repeatedly retry or truncate and write back. |
| `422 RESOURCE_CONTENT_UNSUPPORTED` | Explain that this is not a supported Markdown file Resource; do not bypass Iris. |
| `502 CONTENT_PROVIDER_ERROR` | Report Iris content-provider failure. Stop dependent writes; a write outcome may be unknown, so inspect state after recovery before any retry. |
| `500 INTERNAL_ERROR` | A failed create may have an unknown result. Inspect Resources/content before retrying; request operator inspection if the state cannot be resolved. |

Use only Iris APIs and the runtime `IRIS_API_URL` / `IRIS_API_TOKEN`. Provider credentials
and repository operations belong to the server; never request credentials in chat or
access the provider directly. Ordinary Resource POST can register an existing file only
when its location is established and registration is intended; CREATE does not overwrite it.
There is no content DELETE, move/rename, automatic repair, semantic Markdown editing or
PRD decomposition endpoint. The Agent performs planning itself.

### PRD intent and structured state

- **Save only:** resolve Project → inspect Resources → create/resolve PRD with `role=spec`
  → verify → respond and stop. A matching PRD is not permission to overwrite it; use
  GET + PUT only for an established update intent. Create no Milestones or Tasks.
- **Save and plan:** create/resolve and read the PRD → list current Milestones and Tasks →
  choose optional meaningful phases using concepts.md → reuse matches → create only
  missing phases and concrete Tasks → verify and report Resource/Milestone/Task results.
- **Analyze only:** read the PRD and recommend a plan without persisting it.

Keep long-form content in Resources and execution state in Tasks. Ordinary PRDs/specs/notes
are not Capabilities. Use Project scope for project-wide/cross-phase content; resolve a
Milestone or Task scope only when the document clearly belongs to it. Roles and scope
semantics are defined in concepts.md.

## 10. Capabilities

- List: `GET /api/v1/projects/{projectId}/capabilities`.
  Optional query: `type`, `enabled` (`true` or `false` strings).
  Results are ordered by creation time ascending.
- Create/register: `POST /api/v1/projects/{projectId}/capabilities`.
  Required body fields: `name`, `type`, `resource_id`.
  Optional: `description`, `enabled` (defaults to `true`, per the operation description).
- Read: `GET /api/v1/projects/{projectId}/capabilities/{capabilityId}`.
- Update: `PATCH /api/v1/projects/{projectId}/capabilities/{capabilityId}`.
  Writable body fields (all optional): `name`, `description`, `type`, `resource_id`, `enabled`.
- Enable: `POST /api/v1/projects/{projectId}/capabilities/{capabilityId}/enable`.
- Disable: `POST /api/v1/projects/{projectId}/capabilities/{capabilityId}/disable`.
  Both actions are idempotent and specify no request body.

`type`: `script`, `skill`. `enabled` in a JSON body is a boolean.
`name` and `resource_id` must be nonempty; `description` may be null.
The create operation explicitly requires a Resource owned by the same user and Project:
`script` requires Resource kind `file`; `skill` requires Resource kind `directory`.
Changing `type` or `resource_id` revalidates Resource ownership and kind.
Disabling does not release the Resource's reference protection.
These APIs register Capabilities; they do not execute them.
Create returns `201`; list/read/update/enable/disable return `200`.

## 11. Common Agent Workflows

Read before write. Use returned IDs in every subsequent path or body.

### Create a Project and initialize its README

This is an Agent-orchestrated workflow, not automatic behavior of Project POST.

1. List Projects (including archived matches) and resolve duplicates. Require an explicit
   Project name and authorization to create it, following SKILL.md.
2. `POST /api/v1/projects` with the confirmed `name`, a valid `slug` and intended optional
   fields. Verify the `201` response and capture `data.id`; do not guess the Project ID.
3. Unless the user excluded README creation, list that Project's Resources. If a README
   already exists, resolve and GET its content; reuse it without overwriting. Do not
   initialize older Projects merely because they were found during duplicate checks.
4. If absent, `POST /api/v1/projects/{projectId}/resources/markdown` with `name: "README.md"`,
   `path: "README.md"`, `role: "context"`, and `content`. Omit `milestone_id` and `task_id`.
   Use user-supplied README text, or a Markdown heading with the confirmed Project name
   followed by its confirmed description if available. Do not invent additional content.
5. Verify `data.resource` and `data.content`, then GET content using the returned Resource
   ID and compare the saved text. Report Project and README results separately.

The server chooses the repository and physical file path. This does not create a new
repository. If README creation fails, keep the created Project and report partial
completion. On an unknown outcome, re-list Resources and read matching content before
resuming; do not repeat Project creation. Handle `CONTENT_ALREADY_EXISTS` using the
content error workflow, without overwrite or automatic renaming. The two writes are
not an atomic transaction. No Tasks, Milestones or Capabilities are implied.

### Find a project and inspect its work

1. `GET /api/v1/projects`; use `include_archived=true` when archived Projects are relevant.
2. Identify the Project from the response and resolve `projectId`.
3. `GET /api/v1/projects/{projectId}/milestones`.
4. `GET /api/v1/projects/{projectId}/tasks`.

### Add a task to a project

If the user insists on creation, first require a Project name explicitly supplied or
unambiguously confirmed by the user in this request's context. If absent, ask for it
and refuse creation until supplied; do not invent a name or use a default Project.
A previously explicit Project name need not be requested again. If that Project is
missing, creating it also requires explicit authorization for that named Project;
“force-create the Task” alone is insufficient. Apply duplicate checks before creation.

1. `GET /api/v1/projects` and resolve the Project.
   If the explicitly named Project cannot be resolved, stop and ask the user to
   confirm the target or explicitly authorize creation. Do not create a Project or
   Task, or substitute another Project, while waiting. Similar names are candidates
   for confirmation only, not permission to write.
2. `GET /api/v1/projects/{projectId}/tasks`; inspect existing tasks to avoid duplicates.
   Distinguish an explicitly requested new title from a reference to an existing
   Task. If a referenced existing Task is missing, stop for clarification; do not
   reinterpret the reference as permission to create a replacement. An explicitly
   requested new Task in a resolved Project may proceed after duplicate checks.
3. If assigning a Milestone, `GET /api/v1/projects/{projectId}/milestones` and resolve its ID.
4. `POST /api/v1/projects/{projectId}/tasks` with `title` and only needed optional fields.

After the user clarifies a missing target, resolve the confirmed entity from current
state and check for duplicates before continuing any authorized creation. If the new
target is also missing, stop again; never guess an ID or silently redirect the request.

### Mark a task complete

1. `GET /api/v1/projects` and resolve the Project.
2. `GET /api/v1/projects/{projectId}/tasks` and resolve the task.
   If the named Project or Task cannot be resolved, stop and ask for clarification.
   Do not create a replacement Project/Task or select a similar record without confirmation.
3. `PATCH /api/v1/projects/{projectId}/tasks/{taskId}` with `{"status":"completed"}`.
4. Optionally `GET /api/v1/projects/{projectId}/tasks/{taskId}` to confirm the returned status.

### Attach a Resource

1. `GET /api/v1/projects` and resolve the Project.
2. If relevant, resolve a Milestone with `GET /api/v1/projects/{projectId}/milestones`
   or a task with `GET /api/v1/projects/{projectId}/tasks`.
3. `GET /api/v1/projects/{projectId}/resources` and inspect existing metadata.
4. `POST /api/v1/projects/{projectId}/resources` with `name`, `kind`, `role`, and the applicable
   scope/location fields. Resolve unspecified location requirements before writing; do not guess.

### Register a Capability

1. `GET /api/v1/projects` and resolve the Project.
2. `GET /api/v1/projects/{projectId}/resources`; resolve a matching Resource first.
3. If absent, create it with `POST /api/v1/projects/{projectId}/resources`, subject to the
   Resource constraints above, and capture the returned `id`.
4. `GET /api/v1/projects/{projectId}/capabilities` to inspect existing registrations.
5. `POST /api/v1/projects/{projectId}/capabilities` with `name`, `type`, and `resource_id`.

## 12. Error Handling

Documented errors use `{"success":false,"error":{"code":"...","message":"..."}}`.
Consult each operation's responses; not every operation declares every status below.

| Status | Documented meaning | Agent action |
| ------ | ------------------ | ------------ |
| `400` | Request parameter validation failed | Check fields, types, enum values, and parameters. |
| `401` | Missing or invalid access token | Check runtime credentials without exposing them. |
| `404` | Entity missing or outside the current user/URL Project scope | Re-resolve IDs and ownership context. |
| `409` | Slug/reference conflict, content already exists, or revision conflict | Inspect the error code; use the Markdown error workflow for content conflicts. |
| `413` | Markdown exceeds the supported size | Do not truncate and write back. |
| `422` | Invalid scope/location/kind, or unsupported Content Resource | Recheck constraints; never bypass Iris. |
| `502` | Iris content-provider failure | Stop dependent writes and inspect uncertain outcomes before retrying. |

Bundled `ApiError.error.code` enum values (20, synchronized with the current source):
`BAD_REQUEST`, `UNAUTHORIZED`, `NOT_FOUND`, `INTERNAL_ERROR`,
`PROJECT_NOT_FOUND`, `MILESTONE_NOT_FOUND`, `TASK_NOT_FOUND`, `RESOURCE_NOT_FOUND`,
`CAPABILITY_NOT_FOUND`, `SLUG_ALREADY_EXISTS`, `INVALID_RESOURCE_SCOPE`,
`INVALID_RESOURCE_LOCATION`, `INVALID_CAPABILITY_RESOURCE_KIND`, `RESOURCE_IN_USE`,
`CONTENT_ALREADY_EXISTS`, `CONTENT_NOT_FOUND`, `CONTENT_CONFLICT`, `CONTENT_TOO_LARGE`,
`RESOURCE_CONTENT_UNSUPPORTED`, `CONTENT_PROVIDER_ERROR`.
Re-run `pnpm run openapi:export` after changing error codes so the bundled artifact stays synchronized.
The shared enum does not define a per-operation code-to-status mapping;
do not infer additional HTTP statuses from the code names.

## 13. Minimal HTTP Examples

Supply `IRIS_API_URL` and `IRIS_API_TOKEN` through the runtime environment.
Set `PROJECT_ID` and `TASK_ID` from prior responses. These examples do not assign secrets.

List Projects:

```bash
curl -H "Authorization: Bearer $IRIS_API_TOKEN" \
  "$IRIS_API_URL/api/v1/projects"
```

Create a task after resolving the Project and checking for duplicates:

```bash
curl -X POST -H "Authorization: Bearer $IRIS_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"title":"Review API guide"}' \
  "$IRIS_API_URL/api/v1/projects/$PROJECT_ID/tasks"
```

Complete a resolved task:

```bash
curl -X PATCH -H "Authorization: Bearer $IRIS_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"status":"completed"}' \
  "$IRIS_API_URL/api/v1/projects/$PROJECT_ID/tasks/$TASK_ID"
```

## 14. Full Specification

For exact schemas, enums, parameters, response bodies, and all available endpoints, read:

`openapi.json`

Agent must prefer OpenAPI whenever exact API details are needed.
