# Resource Metadata API

## Purpose

Register and manage pointers to durable material; these operations do not read or write
the material itself. Use [content-api.md](content-api.md) only for Markdown body operations.
Follow configuration, authentication and read-before-write in [SKILL.md](../SKILL.md).

## Routes

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/v1/projects/{projectId}/resources` | List metadata |
| POST | `/api/v1/projects/{projectId}/resources` | Register a pointer |
| GET | `/api/v1/projects/{projectId}/resources/{resourceId}` | Read metadata |
| PATCH | `/api/v1/projects/{projectId}/resources/{resourceId}` | Update/rebind metadata |
| DELETE | `/api/v1/projects/{projectId}/resources/{resourceId}` | Remove metadata only |

## Request

- List query (optional): `kind`, `role`, `milestone_id`, `task_id`; IDs are nonempty
  strings belonging to this user/Project. Filters are combined with AND. Omitted child
  filters include all scopes; there is no null/project-only filter. Two valid child
  filters together cannot match a Resource because stored child scopes are exclusive.
- Create required: `name` (nonempty string), `kind`, `role`.
  Optional in the schema: `milestone_id`, `task_id`, `repository`, `path`, `url`
  (each a nonempty string or null). Required location combinations are below.
- PATCH accepts the same fields, all optional; omission preserves values, null clears
  nullable fields. Validation applies to the complete merged record.
- `kind`: `repository`, `directory`, `file`, `url`.
- `role`: `context`, `spec`, `artifact`, `reference`.
- Project comes from the URL; do not send `project_id`, IDs, ownership or timestamps.
  Unknown body properties are rejected. DELETE has no body.

Minimum non-null location requirements, verified from the current implementation:

| kind | Required location |
| --- | --- |
| `repository` | `repository` |
| `directory` | `repository`, `path` |
| `file` | `repository`, `path` |
| `url` | `url` |

Additional location fields are allowed. Metadata validation requires nonempty strings,
not a repository/path/URL syntax; it does not check whether the material exists.
The OpenAPI optional-property list does not fully express this location matrix.

## Response fields important to Agent

Success envelope: `success: true`, `data` is an array for list or an object otherwise.
Create returns `201`; list/read/PATCH return `200`; DELETE returns `204` with no body.
Use `id`, `projectId`, `milestoneId`, `taskId`, `name`, `kind`, `role`, `repository`,
`path`, `url`. Child scope and location values can be null. No Markdown body is returned.

## Semantics

- List orders by creation time ascending. Project scope has both child IDs null;
  Milestone scope has only `milestone_id`; Task scope has only `task_id`.
  A Task Resource must not repeat the Task's Milestone ID. All links remain in the same
  user/Project. For choosing role or scope, load [concepts.md](concepts.md) only as needed.
- Read current metadata and inspect duplicates before registration. Multiple Resources
  may intentionally point at the same location; location is not unique.
- POST registers only a pointer, including an existing file when its location is
  established and registration is intended. It neither creates nor verifies content.
- PATCH rebinds pointers; it does not move, rename, create or delete files. Switching
  child scope must explicitly clear the old child field in the same PATCH.
- DELETE removes metadata only. Any referencing Capability, including a disabled one,
  blocks deletion. A kind change must preserve every reference's compatibility:
  `script` requires `file`, `skill` requires `directory`.
- Metadata GET is not a content read. `updatedAt` does not prove Markdown content changed.
- When using the existing local content client/cache, locator PATCH and DELETE require
  invalidation; follow [local-cache.md](local-cache.md), including for raw API mutations.

## Relevant errors

- `400 BAD_REQUEST`: invalid schema fields, enum, empty ID/location or query.
- `401 UNAUTHORIZED`: check approved Iris credentials without exposing them.
- `404 PROJECT_NOT_FOUND`, `MILESTONE_NOT_FOUND`, `TASK_NOT_FOUND`, `RESOURCE_NOT_FOUND`:
  the relevant Project, filter, relation or target is missing/outside user/Project scope.
- `422 INVALID_RESOURCE_SCOPE`: both child scopes are non-null.
- `422 INVALID_RESOURCE_LOCATION`: the merged kind lacks required location fields.
- `422 INVALID_CAPABILITY_RESOURCE_KIND`: PATCH would break a Capability's required kind.
- `409 RESOURCE_IN_USE`: DELETE is blocked by a Capability reference; do not bypass it.

## Short examples

To move a Milestone-scoped pointer to a resolved Task, PATCH its item path with
`{"milestone_id":null,"task_id":"<resolved task ID>"}`. This changes metadata scope only.

Exact schema or unexpected behavior: consult the relevant section of [openapi.json](openapi.json).
