# Task API

## Purpose

Manage executable work, optional Milestone assignment and explicit completion state.
Use the configuration, authentication and read-before-write protocol in [SKILL.md](../SKILL.md).

## Routes

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/v1/projects/{projectId}/tasks` | List Tasks |
| POST | `/api/v1/projects/{projectId}/tasks` | Create a Task |
| GET | `/api/v1/projects/{projectId}/tasks/{taskId}` | Read a Task |
| PATCH | `/api/v1/projects/{projectId}/tasks/{taskId}` | Update Task/status/assignment/order |

## Request

- List query (optional): `status`, `milestone_id` (nonempty ID of a Milestone in this Project).
  Omit `milestone_id` for all Project Tasks; there is no null/unassigned-only query value.
- Create required: `title` (nonempty string).
  Optional: `description` (string or null), `milestone_id` (nonempty string or null),
  `status`, `position` (integer).
- PATCH accepts those five fields, all optional. Omission preserves existing values;
  explicit `milestone_id: null` removes the Milestone assignment.
- `status`: `todo`, `doing`, `completed`, `cancelled`; create default `todo`.
- Project comes from the URL. Do not send `project_id`, IDs, ownership or timestamps;
  unknown body fields are rejected. There are no scheduling, due-date or reminder fields.

## Response fields important to Agent

Success envelope: `success: true`, `data` is an array for list or an object otherwise.
Create returns `201`; list/read/PATCH return `200`.
Use `id`, `projectId`, `milestoneId` (nullable), `title`, `description`, `status`,
`position`, `completedAt` (ISO 8601 UTC or null).

## Semantics

- A linked Milestone must belong to the same user and Project. Resolve an unfamiliar
  Milestone with [milestone-api.md](milestone-api.md) only when assignment requires it.
- List orders by `position` ascending. Initial position defaults to 100, then maximum
  + 100 within the chosen Milestone, or among unassigned Project Tasks. Changing
  Milestone does not automatically recalculate position. Positions are not global priorities.
- Non-completed → completed sets `completedAt`; completed → non-completed clears it.
  Completed → completed preserves it; edits without status preserve it. Creating an
  already completed Task sets it immediately. Never supply completion time yourself
  or infer it from `updatedAt`.
- There is no completion action or delete route. Use PATCH; abandoned work uses `cancelled`.
  Completing a Task does not change Milestone/Project status.
- Read and resolve the actual Task before updating. Missing referenced Tasks are not
  permission to create replacements; explicit new-Task requests require duplicate checks.
  Load [project-api.md](project-api.md) only if the owning Project still needs resolution.
- Keep long-form outputs in Markdown Resources. Timing in Task text is not a schedule.

## Relevant errors

- `400 BAD_REQUEST`: invalid writable fields, enum, position or query.
- `401 UNAUTHORIZED`: check approved Iris credentials without exposing them.
- `404 PROJECT_NOT_FOUND`: list/create Project is missing or inaccessible.
- `404 MILESTONE_NOT_FOUND`: supplied list filter or assignment is missing/out of scope.
- `404 TASK_NOT_FOUND`: read/PATCH Task is missing or outside the user/URL Project.

## Short examples

After resolving the Task, PATCH its item path with `{"status":"completed"}`.
To detach it from a Milestone, PATCH `{"milestone_id":null}`; omitting this field
does not detach it. Both examples preserve other writable fields.

Exact schema or unexpected behavior: consult the relevant section of [openapi.json](openapi.json).
