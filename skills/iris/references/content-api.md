# Markdown Resource Content API

Use this reference for durable Markdown CREATE / READ / UPDATE. Follow SKILL.md's
Preflight, target resolution, authorization and verification. Call only Iris APIs;
provider credentials and physical repository mapping belong to the server.

Direct Iris API requests need no helper. If using the existing optional
`scripts/iris-content.mjs` client, load [local-cache.md](local-cache.md) for its transport
and cache rules. Only client GETs use its TTL cache; force-refresh for latest-state requests,
conflict recovery and post-write verification. When mixing raw API writes with an existing
client cache, invalidate the affected entries on CREATE, content PUT success/conflict or
uncertain result, locator PATCH and metadata DELETE. No client cache means no helper is needed.
The table below is the server contract; client GETs return the reduced snapshot
resourceId/content/revision/sizeBytes. Cache is temporary, not durable truth.

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
| `400 BAD_REQUEST` | Check documented field types and required/unknown properties. |
| `401 UNAUTHORIZED` | Follow SKILL.md credential recovery without exposing secrets. |
| `404 PROJECT_NOT_FOUND / MILESTONE_NOT_FOUND / TASK_NOT_FOUND / RESOURCE_NOT_FOUND` | Resolve identity and ownership; never create a replacement automatically. |
| `422 INVALID_RESOURCE_SCOPE / INVALID_RESOURCE_LOCATION` | Correct CREATE child scope or canonical Markdown path within user intent. |
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

## Minimal examples

After resolving Project and checking duplicate Resources, CREATE with:

```json
{"name":"Design","path":"specs/design.md","role":"spec","content":"# Design\n"}
```

For UPDATE, first GET current text/revision, preserve unrelated sections, and PUT:

```json
{"content":"<full minimally edited Markdown>","expected_revision":"<revision from GET>"}
```

Use [resource-api.md](resource-api.md) for metadata discovery or pointer changes;
[project-api.md](project-api.md) only when Project resolution is needed. Domain ambiguity
uses [concepts.md](concepts.md). Exact missing detail or drift uses [openapi.json](openapi.json).
Do not load Finance, Reminder or Notification references for ordinary content operations.
