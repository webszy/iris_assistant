# Local Markdown Content Client

Use `scripts/iris-content.mjs` with Node.js 18+ built-ins; no installation or npm dependencies.
This is a local Skill runtime, not a Worker cache. No server or OpenAPI changes are required.
Run the Skill's session Preflight and resolve Project/Resource IDs before using it.
The client does not repeat health/auth calls for every cached read. It does not resolve
names, create Projects, reconcile conflicts or automatically retry writes.

## Configuration and security

- Required for API operations: runtime `IRIS_API_URL`, `IRIS_API_TOKEN`.
- Optional `IRIS_CACHE_DIR`: absolute directory outside Git checkouts, the Skill and cwd.
  Default on macOS: `~/Library/Caches/Iris`; Linux: `${XDG_CACHE_HOME:-~/.cache}/iris`;
  Windows: `%LOCALAPPDATA%/Iris/Cache` (home fallback).
- Optional `IRIS_CACHE_TTL_SECONDS`: positive integer seconds, default **300**. Invalid,
  zero, negative, fractional or values above 2147483647 fall back to 300.
- No provider credentials are required or read. The client reads exported environment
  variables, not config files. Load a trusted local config in the shell without tracing.
- Best-effort directory mode `0700`, file mode `0600`. Cache errors warn on stderr and
  fall back to API; chmod failure does not disable Iris. Credential/config values and
  raw upstream error text are never logged. Redirects are rejected; requests time out
  after 30 seconds, with no automatic retry.

Cache filenames are `content/<sha256>.json`, hashing a JSON tuple of normalized API URL,
Project ID and Resource ID. Tuple encoding avoids separator collisions. URL normalization
uses URL parsing and removes trailing slashes; URLs with credentials/query/fragment are
rejected. Tokens, names and physical file paths are never part of the filename.
Entries contain only version (1), projectId, resourceId, content, revision, sizeBytes,
cachedAt and expiresAt. No headers, cookies, tokens or runtime configuration are stored.
Document content is private local plaintext, not an encrypted store; do not put credentials
in Markdown. Different accounts on the same OS profile must use separate cache directories
or clear-cache when switching identities; keys deliberately do not include tokens.

## Commands

Paths below assume the repository root; when installed, resolve the script relative to
SKILL.md. Use IDs returned by Iris, never names or guessed IDs.

```sh
node skills/iris/scripts/iris-content.mjs get --project "$PROJECT_ID" --resource "$RESOURCE_ID"
node skills/iris/scripts/iris-content.mjs get --project "$PROJECT_ID" --resource "$RESOURCE_ID" --refresh
node skills/iris/scripts/iris-content.mjs put --project "$PROJECT_ID" --resource "$RESOURCE_ID" --input /absolute/path/update.json
node skills/iris/scripts/iris-content.mjs create --project "$PROJECT_ID" --input /absolute/path/create.json
node skills/iris/scripts/iris-content.mjs patch --project "$PROJECT_ID" --resource "$RESOURCE_ID" --input /absolute/path/resource-patch.json
node skills/iris/scripts/iris-content.mjs delete --project "$PROJECT_ID" --resource "$RESOURCE_ID"
node skills/iris/scripts/iris-content.mjs invalidate --project "$PROJECT_ID" --resource "$RESOURCE_ID"
node skills/iris/scripts/iris-content.mjs clear-cache
```

`--input -` reads JSON from stdin instead of a file. Never place large Markdown or tokens
in argv. Use JSON serialization to prepare bodies (not shell interpolation); preserve text.
PUT input: `{"content":"updated Markdown", "expected_revision":"revision from GET"}`.
Optional `commit_message` is supported. CREATE and Resource PATCH accept the exact bodies
in api-guide.md/OpenAPI; no additional server fields are invented. `delete` removes Resource
metadata only. Run mutations only with the user's authorization and resolved targets.

GET returns the same minimal snapshot on cache hit and miss:
`{"success":true,"data":{"resourceId":"…","content":"…","revision":"…","sizeBytes":123}}`.
Repository/path metadata is deliberately omitted from this client snapshot; obtain it from
Resource APIs when needed. Mutations return the API success envelope; DELETE normalizes
204 to `{"success":true,"data":null}`. Local clear/invalidate report best-effort completion,
not a guarantee that an unremovable file was deleted. Success JSON alone goes to stdout;
errors are safe JSON on stderr with nonzero exit status. Cache warnings also use stderr.

## Read and write behavior

- GET validates version, identity, field types, UTF-8 byte size and timestamps. A valid
  unexpired entry returns without an Iris request. Missing/expired/malformed entries are
  removed best-effort; API success is cached using exclusive temp-file creation + atomic
  rename. Cache write failures return the API snapshot normally; temp cleanup is best-effort.
- `--refresh` ignores/removes existing cache, fetches the API and replaces the cache only
  on success. Use for “latest”, “read again”, suspected changes and conflict recovery.
- PUT always sends the provided `expected_revision` to Iris, including when it came from
  cache. Only Iris/GitHub decides whether it is valid. Never infer write success from a
  matching local revision. No local-only writes or write-through caching exist.
- PUT success and `CONTENT_CONFLICT` invalidate immediately. Writes also invalidate before
  dispatch and after uncertain failures, preventing reuse after a lost response. After a
  conflict, force-refresh, compare latest text to the intended edit and retry only if safe;
  ask the user on semantic conflicts. The client does not merge or retry automatically.
- CREATE invalidates the returned Resource ID and never caches the response. Locator PATCH
  (`kind`, `repository`, `path`) and DELETE invalidate; name/role/scope-only PATCH need not.
  Raw API mutations outside the client must call `invalidate` for these same events.
- API errors, including CONTENT_NOT_FOUND, RESOURCE_CONTENT_UNSUPPORTED, CONTENT_TOO_LARGE,
  provider and network errors, invalidate the affected GET entry and propagate. No expired
  fallback is implemented. Do not describe a cache hit as a freshly verified server state.
- Each CLI startup best-effort scans managed hash-named entries, removing invalid/expired
  entries. Unrelated files are untouched. `clear-cache` removes all managed entries in the
  selected content directory (across API namespaces); no credentials are needed for clear.
  No LRU, cache server, webhook or inter-client synchronization exists.

The cache is a temporary copy, not Memory, a knowledge base or an offline canonical store.
Iris API / GitHub remains durable content truth; D1 remains structured state; conversation
supplies intent/context. Other Agents and direct repository edits can leave a local read
stale for the configured TTL. Aliases pointing at the same file have independent keys;
refresh those aliases when changes are known. Server revision checks preserve write safety.
Filesystem deletion is best-effort: if warned about invalidation failure, use `--refresh`
for subsequent reads and fix local cache permissions. Do not trust the old cache.

## Mac verification (manual; no live GitHub required for tests)

From the source repository root:

```sh
node --test skills/iris/scripts/iris-content.test.mjs
```

Tests inject a mock fetch, fake clock and filesystem failures, using temporary directories
only. They do not load real credentials, start Worker, or contact Iris/GitHub.
For an authorized read-only smoke check, first complete Skill Preflight, then:

```sh
set +x
set -a
. "$HOME/.iris/config.env"
set +a
# Set PROJECT_ID and RESOURCE_ID to resolved existing IDs.
node skills/iris/scripts/iris-content.mjs get --project "$PROJECT_ID" --resource "$RESOURCE_ID"
node skills/iris/scripts/iris-content.mjs get --project "$PROJECT_ID" --resource "$RESOURCE_ID"
node skills/iris/scripts/iris-content.mjs get --project "$PROJECT_ID" --resource "$RESOURCE_ID" --refresh
```

The first GET populates cache, the second reuses it, and refresh fetches again. Request-count
assertions in the mock tests verify this distinction without adding debug noise to stdout.
Use a disposable test Resource for manual PUT/conflict checks: GET, edit via a JSON input
file, PUT with that revision, verify the cache entry is absent, then GET again. Repeat PUT
with the older revision after an actual content change; expect conflict, invalidation and
no blind retry. Never run the DELETE example against a Resource you intend to retain.
