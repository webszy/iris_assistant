# Iris API Quick Guide

## 1. Source of Truth

- This file is a quick operational guide.
- `openapi.json` is the authoritative API specification (Iris API, version `0.1.0`).
- If this guide and OpenAPI differ, follow `openapi.json`.

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
Operations handle metadata; creation does not access Git or URL contents.
Deletion removes only Iris metadata, not Git files or URL contents, and does not call GitHub.
A Resource referenced by any Capability, including a disabled one, cannot be deleted (`409`).

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

### Find a project and inspect its work

1. `GET /api/v1/projects`; use `include_archived=true` when archived Projects are relevant.
2. Identify the Project from the response and resolve `projectId`.
3. `GET /api/v1/projects/{projectId}/milestones`.
4. `GET /api/v1/projects/{projectId}/tasks`.

### Add a task to a project

1. `GET /api/v1/projects` and resolve the Project.
2. `GET /api/v1/projects/{projectId}/tasks`; inspect existing tasks to avoid duplicates.
3. If assigning a Milestone, `GET /api/v1/projects/{projectId}/milestones` and resolve its ID.
4. `POST /api/v1/projects/{projectId}/tasks` with `title` and only needed optional fields.

### Mark a task complete

1. `GET /api/v1/projects` and resolve the Project.
2. `GET /api/v1/projects/{projectId}/tasks` and resolve the task.
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
| `409` | Project slug already exists for this user, or Resource is still referenced | Inspect the existing Project or Capability references before retrying. |
| `422` | Resource scope/location invalid, or Capability/Resource kinds incompatible | Recheck the documented constraints and merged update. |

Exact `ApiError.error.code` enum values:
`BAD_REQUEST`, `UNAUTHORIZED`, `NOT_FOUND`, `INTERNAL_ERROR`,
`PROJECT_NOT_FOUND`, `MILESTONE_NOT_FOUND`, `TASK_NOT_FOUND`, `RESOURCE_NOT_FOUND`,
`CAPABILITY_NOT_FOUND`, `SLUG_ALREADY_EXISTS`, `INVALID_RESOURCE_SCOPE`,
`INVALID_RESOURCE_LOCATION`, `INVALID_CAPABILITY_RESOURCE_KIND`, `RESOURCE_IN_USE`.
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
