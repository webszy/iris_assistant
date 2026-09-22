# Project API

## Purpose

Manage the current user's long-lived Project containers and their archive state.
Use the configuration, authentication and read-before-write protocol in [SKILL.md](../SKILL.md).

## Routes

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/v1/projects` | List Projects |
| POST | `/api/v1/projects` | Create a Project |
| GET | `/api/v1/projects/{projectId}` | Read a Project |
| PATCH | `/api/v1/projects/{projectId}` | Update a Project |
| POST | `/api/v1/projects/{projectId}/archive` | Archive |
| POST | `/api/v1/projects/{projectId}/unarchive` | Unarchive |

## Request

- List query (optional): `status`, `kind`, `include_archived` (string `true` or `false`).
- Create required: `name` (nonempty string), `slug` (matches `^[a-z0-9-]+$`).
  Optional: `description` (string or null), `kind`, `status`.
- PATCH accepts the same fields, all optional; omitted fields retain their values.
- `kind`: `product`, `operation`, `automation`, `personal`, `content`, `other`;
  create default `other`.
- `status`: `planned`, `active`, `paused`, `completed`; create default `planned`.
- Archive/unarchive take no request body. Do not send IDs, ownership or timestamps
  in create/PATCH bodies; unknown properties are rejected.

## Response fields important to Agent

Success envelope: `success: true`, `data` is an array for list or an object otherwise.
Create returns `201`; other operations return `200`.
Use `id`, `name`, `slug`, `description`, `kind`, `status`, `archivedAt`.
`archivedAt` is an ISO 8601 UTC timestamp or null; it is separate from `status`.

## Semantics

- List excludes archived Projects unless `include_archived=true`; this includes both
  archived and unarchived records. Results use creation time descending, without pagination.
- Check archived matches as well as active records before creating a duplicate context.
  A missing named Project requires clarification or explicit authorization to create
  that named Project; never substitute another Project.
- Slug uniqueness is per user, including archived Projects. Valid slugs are not rewritten.
- Archive/unarchive are idempotent. Archive preserves status, children and history;
  it hides the record from the default list, not from direct reads. No hard-delete route.
- Task/Milestone completion does not automatically complete the Project.
- Creating a Project does not create a README on the server. Follow SKILL.md's new-Project
  workflow; load [content-api.md](content-api.md) only for Markdown initialization and
  [resource-api.md](resource-api.md) when inspecting existing Resource metadata.

## Relevant errors

- `400 BAD_REQUEST`: invalid fields, enum, slug or query value.
- `401 UNAUTHORIZED`: reload/check approved Iris credentials without exposing them.
- `404 PROJECT_NOT_FOUND`: item/action target is missing or belongs to another user.
- `409 SLUG_ALREADY_EXISTS`: create/PATCH conflicts with this user's existing slug;
  resolve the existing Project before deciding what to do.

Exact schema or unexpected behavior: consult the relevant section of [openapi.json](openapi.json).
