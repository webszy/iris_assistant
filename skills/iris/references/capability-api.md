# Capability API

## Purpose

Register reusable abilities backed by Resources and record whether they are enabled.
Use the configuration, authentication and read-before-write protocol in [SKILL.md](../SKILL.md).

## Routes

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/v1/projects/{projectId}/capabilities` | List registrations |
| POST | `/api/v1/projects/{projectId}/capabilities` | Register an ability |
| GET | `/api/v1/projects/{projectId}/capabilities/{capabilityId}` | Read a registration |
| PATCH | `/api/v1/projects/{projectId}/capabilities/{capabilityId}` | Update a registration |
| POST | `/api/v1/projects/{projectId}/capabilities/{capabilityId}/enable` | Enable |
| POST | `/api/v1/projects/{projectId}/capabilities/{capabilityId}/disable` | Disable |

## Request

- List query (optional): `type`, `enabled` (string `true` or `false`).
- Create required: `name` (nonempty string), `type`, `resource_id` (nonempty string).
  Optional: `description` (string or null), `enabled` (JSON boolean, default `true`).
- PATCH accepts the same five fields, all optional; omission preserves values.
- `type`: `script`, `skill`.
- Enable/disable have no body. Project comes from the URL; do not send `project_id`,
  IDs, ownership or timestamps. Unknown create/PATCH properties are rejected.

## Response fields important to Agent

Success envelope: `success: true`, `data` is an array for list or an object otherwise.
Create returns `201`; other operations return `200`.
Use `id`, `projectId`, `name`, `description`, `type`, `resourceId`, `enabled` (boolean).

## Semantics

- List orders by creation time ascending.
- Every Capability requires a Resource in the same user/Project: `script` → `file`,
  `skill` → `directory`. Create and PATCH validate the resulting reference and kind,
  including when changing type or resource. Resolve or register metadata through
  [resource-api.md](resource-api.md) only when the workflow requires it.
- Inspect existing registrations before creating. One Resource may back multiple
  Capabilities; Resource reference is not unique.
- Enable/disable are idempotent. Disabled registrations still reference and protect
  their Resources. No Capability delete or execution route exists.
- Registration/enabling records availability; it does not execute anything or prove
  implementation work completed. Ordinary PRDs, specs and notes are not Capabilities.

## Relevant errors

- `400 BAD_REQUEST`: invalid fields, type, boolean or query.
- `401 UNAUTHORIZED`: check approved Iris credentials without exposing them.
- `404 PROJECT_NOT_FOUND`: list/create Project is missing or inaccessible.
- `404 CAPABILITY_NOT_FOUND`: item/action target is missing/outside user/Project scope.
- `404 RESOURCE_NOT_FOUND`: create/PATCH reference is missing/outside user/Project scope.
- `422 INVALID_CAPABILITY_RESOURCE_KIND`: Resource kind does not match the resulting type.

Exact schema or unexpected behavior: consult the relevant section of [openapi.json](openapi.json).
