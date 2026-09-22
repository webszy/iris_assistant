# Milestone API

## Purpose

Manage optional meaningful phases within a resolved Project.
Use the configuration, authentication and read-before-write protocol in [SKILL.md](../SKILL.md).

## Routes

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/v1/projects/{projectId}/milestones` | List phases |
| POST | `/api/v1/projects/{projectId}/milestones` | Create a phase |
| GET | `/api/v1/projects/{projectId}/milestones/{milestoneId}` | Read a phase |
| PATCH | `/api/v1/projects/{projectId}/milestones/{milestoneId}` | Update phase/status/order |

## Request

- List query (optional): `status`.
- Create required: `name` (nonempty string).
  Optional: `description` (string or null), `status`, `position` (integer).
- PATCH accepts those four fields, all optional; omitted fields retain their values.
- `status`: `planned`, `active`, `completed`, `cancelled`; create default `planned`.
- Project comes from the URL. Do not send `project_id`, IDs, ownership or timestamps;
  unknown body properties are rejected. No due-date or completion-time field exists.

## Response fields important to Agent

Success envelope: `success: true`, `data` is an array for list or an object otherwise.
Create returns `201`; list/read/PATCH return `200`.
Use `id`, `projectId`, `name`, `description`, `status`, `position`.

## Semantics

- The phase must belong to the authenticated user and URL Project.
- List orders by `position` ascending. Omitted initial position is 100 for the first
  phase, then the Project's current maximum + 100; creation time is not planning order.
- PATCH changes position only when supplied; it does not reorder adjacent records.
- Several phases may be active simultaneously. Task completion does not change phase
  status, and phase completion does not automatically complete its Project.
- No delete route; use `cancelled` for an abandoned phase when intended.
- Inspect existing phases and compare meaning before creating. A group of Tasks does
  not automatically need a Milestone; use [concepts.md](concepts.md) for that decision.

## Relevant errors

- `400 BAD_REQUEST`: invalid fields, status, integer position or query value.
- `401 UNAUTHORIZED`: check approved Iris credentials without exposing them.
- `404 PROJECT_NOT_FOUND`: list/create Project is missing or inaccessible.
- `404 MILESTONE_NOT_FOUND`: read/PATCH phase is missing or outside the user/URL Project.

Exact schema or unexpected behavior: consult the relevant section of [openapi.json](openapi.json).
