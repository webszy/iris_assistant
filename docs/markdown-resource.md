# Iris v0.1 Markdown Resource — implementation and verification

Status: implementation and tests complete. The targeted run had failed with **49 passed,
44 failed (93 total)**. A local Workers probe confirmed that `redirect: "error"` throws
before the request is sent. The provider now uses `redirect: "manual"` and rejects 3xx
responses through its existing status checks; the matching test assertion was updated.
Re-verified after the fix: the targeted files pass **93/93**, the full suite passes
**250/250** (`pnpm exec vitest run --no-file-parallelism`), `pnpm typecheck` passes and
`pnpm bundle:check` succeeds. Real GitHub E2E against a live repository remains pending.
`skills/iris/references/openapi.json`: **regenerated** from the current source
(18 paths / 30 operations / 43 schemas) with `pnpm run openapi:export`, verified by
`pnpm run openapi:check`. The pending-regeneration notices in this report, the Skill and the
guide have been removed. No deployment or remote mutation was performed. Existing uncommitted
auth/Skill work has been preserved.

## Delivered API and architecture

| Method | Endpoint |
| --- | --- |
| POST | `/api/v1/projects/{projectId}/resources/markdown` |
| GET | `/api/v1/projects/{projectId}/resources/{resourceId}/content` |
| PUT | `/api/v1/projects/{projectId}/resources/{resourceId}/content` |

`Route → Controller → Service → ContentProvider → GitHubContentsProvider`.
The existing Bearer middleware, strict Zod/OpenAPI schemas, response envelopes and
Resource scope validation are reused. D1 stores metadata only. There is no schema migration,
new table, unique location constraint, dependency or background repair system.

CREATE returns `{success:true,data:{resource,content}}`, where `content` is metadata.
GET returns `{success:true,data:{resourceId,repository,path,contentType,content,revision,sizeBytes}}`.
PUT returns the same content metadata without the `content` text. Neither PUT nor GET
updates Resource metadata or `updatedAt`.

The ordinary Resource POST/PATCH/DELETE retain their semantics: register metadata,
rebind metadata pointers, delete metadata only. Multiple pointers may share one file.
The existing Capability reference protection remains in place. There is no Content DELETE.

## Paths, revisions and size

Agent input `specs/prd.md` maps to `projects/<project.id>/specs/prd.md`; the Resource stores
the latter. Slug edits have no effect. READ/UPDATE revalidate kind, logical repository,
canonical path segments, exact Project ID namespace, extension and physical existence.
No prefix-only boundary check is used. Absolute paths, backslashes, null/control bytes,
Windows drive paths, `.`, `..`, empty segments, duplicate/trailing slashes are rejected.
Lowercase `.md` / `.markdown` are required. Hidden and ordinary directory names are allowed.

All content operations enforce **5 * 1024 * 1024 UTF-8 bytes**, including the actual remote
stream. Empty Markdown, BOM and CRLF/LF are preserved. Text is not trimmed or formatted.
Client commit messages are trimmed and limited to 200 Unicode code points; default
`Add <name>` / `Update <name>` messages are truncated without changing the name.

The API exposes `revision`, never `sha`. Internally it is the Git blob SHA, so identical
contents have identical revisions; A→B→A history is intentionally not detected.
UPDATE prechecks the expected revision, then supplies it to GitHub's atomic conditional
PUT. This also applies to identical text. No automatic write retry or merge is performed.

READ first resolves the configured branch to a commit. Contents metadata and any raw
content request use **that immutable commit**, not a moving branch. Small files decode
inline base64; larger files use the Contents endpoint with raw media type. The returned
bytes must match both metadata size and Git blob digest. UTF-8 decoding is strict.
Explicit symlink/submodule metadata is rejected. Response-provided download URLs are
never followed, redirects are refused and the upstream host is fixed to api.github.com.

## CREATE consistency and failures

1. Authenticate, resolve Project, validate text/path/scope/config, allocate Resource ID.
2. Resolve the configured branch and check the Git physical path. Git existence is final;
   an old D1 pointer to a missing file is allowed and does not act as a uniqueness constraint.
3. Create through Contents PUT **without SHA**. GitHub enforces no overwrite even if a
   concurrent create wins after the initial check.
4. Insert the Resource with the preallocated ID. A successful insert is returned without
   introducing an extra post-insert read failure boundary.
5. If insertion throws, read by that ID. If found, return recovered success; if the read
   fails, retain the Git file and return 500 with repair context in safe structured logs.
6. Only a confirmed absent row permits compensation DELETE with the just-created revision.
   A concurrent content change prevents deletion. Rollback success or failure still returns
   500 for the failed Resource creation. Rollback failure is logged for manual repair.

Git CREATE network failures, 5xx and malformed success results may have unknown outcomes:
there is no D1 insert, automatic retry or blind deletion. Rare orphan files require operator
inspection. Logs allow project/resource IDs, logical repository, path, operation, outcome,
status and a validated GitHub request ID; never credentials, raw errors or Markdown bodies.

| HTTP | Added error code |
| --- | --- |
| 409 | `CONTENT_ALREADY_EXISTS` |
| 404 | `CONTENT_NOT_FOUND` |
| 409 | `CONTENT_CONFLICT` |
| 413 | `CONTENT_TOO_LARGE` |
| 422 | `RESOURCE_CONTENT_UNSUPPORTED` |
| 502 | `CONTENT_PROVIDER_ERROR` |

Existing `INVALID_RESOURCE_LOCATION`, `INVALID_RESOURCE_SCOPE`, ownership errors,
`BAD_REQUEST`, `UNAUTHORIZED` and `INTERNAL_ERROR` are reused. Missing/inaccessible repo,
missing branch and invalid upstream auth are provider errors, not CONTENT_NOT_FOUND.
Provider responses and physical configuration are not returned to the Agent.

## Files in this change

- New API layers: `src/routes/resource-content.ts`, `src/controllers/resource-content.ts`,
  `src/schemas/resource-content.ts`, `src/services/resource-content.ts`.
- Provider/policy: `src/providers/content-provider.ts`, `src/providers/github-contents.ts`,
  `src/lib/markdown-content.ts`.
- Integration: `src/app.ts`, `src/services/resources.ts` (shared creation validation),
  `src/routes/resources.ts` (pointer semantics documentation), `src/types/env.ts`,
  `src/controllers/service-errors.ts`, `src/lib/error-codes.ts`, `src/lib/response.ts`.
- Tests: `tests/github-content-fixture.ts`, `tests/github-contents.test.ts`,
  `tests/resource-content.test.ts`, updated `tests/routes.test.ts`.
- Configuration/export: `.dev.vars.example`, `.gitignore`, `scripts/export-openapi.ts`
  (moved under `scripts/`; run with `pnpm run openapi:export`, verify with `pnpm run openapi:check`).
- Documentation: this file and minimal edits to `skills/iris/SKILL.md`,
  `skills/iris/references/api-guide.md`, `skills/iris/references/concepts.md`.

No edits in this feature are intended for the pre-existing package/auth changes,
`scripts/lib/`, `docs/remote-auth-recovery.md`, database schema or migrations.

## Configure locally

Run from `/Users/apple/Desktop/Project/iris_assisant`:

```bash
cd /Users/apple/Desktop/Project/iris_assisant
test -e .dev.vars || cp .dev.vars.example .dev.vars
```

Edit `.dev.vars` locally; do not paste credentials into chat. The blank example is safe to
commit, while real `.dev.vars` / `.env` files remain ignored. Required configuration:

```dotenv
IRIS_MEMORY_REPOSITORY=iris-memory
IRIS_MEMORY_GITHUB_OWNER=<existing-owner>
IRIS_MEMORY_GITHUB_REPO=<existing-repository>
IRIS_MEMORY_GITHUB_BRANCH=main
GITHUB_TOKEN=<local-secret-only>
```

The repository and branch must already exist. Give the server credential access to this
repository's Contents read/write operations. It is never an Agent credential. Metadata APIs
continue to work without these bindings; Content APIs return a safe 502 for missing config.

## Configure Cloudflare (operator commands, not executed)

Store the token with Wrangler's interactive secret prompt; never put its value in a command,
Wrangler vars, source, D1 or documentation:

```bash
pnpm exec wrangler secret put GITHUB_TOKEN
```

Persist the following non-secret `vars` in the existing `wrangler.jsonc` when ready for
deployment, replacing placeholders with the actual existing repository coordinates:

```json
"vars": {
  "IRIS_MEMORY_REPOSITORY": "iris-memory",
  "IRIS_MEMORY_GITHUB_OWNER": "<existing-owner>",
  "IRIS_MEMORY_GITHUB_REPO": "<existing-repository>",
  "IRIS_MEMORY_GITHUB_BRANCH": "main"
}
```

Alternatively, this exact CLI form supplies vars on an operator-approved deployment
(replace owner/repo; this command deploys and has **not** been run):

```bash
pnpm exec wrangler deploy \
  --var 'IRIS_MEMORY_REPOSITORY:iris-memory' \
  --var 'IRIS_MEMORY_GITHUB_OWNER:<existing-owner>' \
  --var 'IRIS_MEMORY_GITHUB_REPO:<existing-repository>' \
  --var 'IRIS_MEMORY_GITHUB_BRANCH:main'
```

Use a persistent vars configuration for subsequent deployments. No new D1 migration is needed.

## Verification to run

Run these commands to verify the current revision. All of them have been completed for the
current revision; see the status above.

```bash
cd /Users/apple/Desktop/Project/iris_assisant
pnpm run openapi:export
pnpm run openapi:check
git diff -- skills/iris/references/openapi.json
pnpm typecheck
pnpm bundle:check
pnpm exec vitest run tests/github-contents.test.ts tests/resource-content.test.ts tests/routes.test.ts
pnpm exec vitest run --no-file-parallelism
```

OpenAPI generation constructs the app in-process; it does not start a server or contact D1.
It updates the existing Skill artifact from the real route/schema source; the notices that used
to mark it pending have been removed. `pnpm run openapi:check` fails when the artifact drifts
from the source, so run it (or `pnpm run openapi:export`) after any route or schema change.
The tests use a stateful mock GitHub transport and real local test D1; no GitHub network is needed.
Note: the default parallel `pnpm test` run aborts with `ECONNRESET` after 7 of 12 files in this
environment; `--no-file-parallelism` runs all 12 files (250 tests) green.

Coverage includes CREATE/READ/UPDATE, strict inputs, UTF-8 limits and raw reads, canonical
paths, same-slug isolation, scope and ownership, existing-file and revision races, metadata
rebinding/deletion, shared pointers, provider/config errors, D1 lost results, compensation,
unknown outcomes, safe logs and OpenAPI contracts. Existing tests retain Capability guards.

## Optional manual E2E (writes test data; operator only)

Only after the checks above, use a dedicated existing test Project and a configured test
repository. Start local development yourself if needed with `pnpm dev`. Supply
`IRIS_API_URL`, `IRIS_API_TOKEN` and `PROJECT_ID` through your runtime environment. These
examples use `jq` and local temporary files to preserve JSON escaping; do not enable shell
tracing or verbose curl. They intentionally leave test files and metadata for inspection.

Create with a unique test filename; it will not overwrite an existing file:

```bash
IRIS_VERIFY_DIR=$(mktemp -d)
IRIS_VERIFY_PATH="tests/memory-test-$(date +%Y%m%d-%H%M%S).md"
printf '# Iris memory test\n' > "$IRIS_VERIFY_DIR/original.md"
jq -n --arg path "$IRIS_VERIFY_PATH" --rawfile content "$IRIS_VERIFY_DIR/original.md" \
  '{name:"Memory verification",path:$path,role:"spec",content:$content}' \
  > "$IRIS_VERIFY_DIR/create.json"
curl --fail-with-body -sS -X POST \
  -H "Authorization: Bearer $IRIS_API_TOKEN" -H 'Content-Type: application/json' \
  --data-binary @"$IRIS_VERIFY_DIR/create.json" \
  "$IRIS_API_URL/api/v1/projects/$PROJECT_ID/resources/markdown" \
  > "$IRIS_VERIFY_DIR/created.json"
RESOURCE_ID=$(jq -er '.data.resource.id' "$IRIS_VERIFY_DIR/created.json")
```

Read and obtain the expected revision:

```bash
curl --fail-with-body -sS -H "Authorization: Bearer $IRIS_API_TOKEN" \
  "$IRIS_API_URL/api/v1/projects/$PROJECT_ID/resources/$RESOURCE_ID/content" \
  > "$IRIS_VERIFY_DIR/read.json"
EXPECTED_REVISION=$(jq -er '.data.revision' "$IRIS_VERIFY_DIR/read.json")
```

Update, then read back:

```bash
printf '# Iris memory test\nUpdated content.\n' > "$IRIS_VERIFY_DIR/updated.md"
jq -n --arg revision "$EXPECTED_REVISION" --rawfile content "$IRIS_VERIFY_DIR/updated.md" \
  '{content:$content,expected_revision:$revision}' > "$IRIS_VERIFY_DIR/update.json"
curl --fail-with-body -sS -X PUT \
  -H "Authorization: Bearer $IRIS_API_TOKEN" -H 'Content-Type: application/json' \
  --data-binary @"$IRIS_VERIFY_DIR/update.json" \
  "$IRIS_API_URL/api/v1/projects/$PROJECT_ID/resources/$RESOURCE_ID/content" \
  > "$IRIS_VERIFY_DIR/updated.json"
curl --fail-with-body -sS -H "Authorization: Bearer $IRIS_API_TOKEN" \
  "$IRIS_API_URL/api/v1/projects/$PROJECT_ID/resources/$RESOURCE_ID/content" \
  > "$IRIS_VERIFY_DIR/read-after.json"
jq -j '.data.content' "$IRIS_VERIFY_DIR/read-after.json" > "$IRIS_VERIFY_DIR/read-after.md"
cmp "$IRIS_VERIFY_DIR/updated.md" "$IRIS_VERIFY_DIR/read-after.md"
```

Then verify:

1. Repeat the saved CREATE: expect 409 CONTENT_ALREADY_EXISTS and no overwrite.
2. Repeat the saved PUT with the old revision: expect 409 CONTENT_CONFLICT, including when
   the submitted text equals the current text. GET again to confirm the content is intact.
3. GET Resource metadata; compare its path and `updatedAt` against the CREATE response.
4. Inspect the test repository's configured branch and commits manually; verify the path
   is `projects/<PROJECT_ID>/<IRIS_VERIFY_PATH>` and the text matches.
5. Check safe structured logs for any errors. Do not delete real user files as cleanup.

## Remaining validation and rollback

Tests, typechecking, generated OpenAPI and real-provider E2E remain pending; this is not a
claim of production verification. Upstream permissions/branch policies are environment
configuration and must be checked on the intended test repository.

Before deployment, revert only this feature's hunks/new files if abandoning it, preserving
pre-existing work. After deployment, rolling back code does not undo created Git commits or
D1 metadata. Inspect any partial creation using the logged Resource ID/path and repository
history; never delete unknown-outcome files or overwrite newer revisions automatically.
