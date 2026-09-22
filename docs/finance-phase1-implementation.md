# Iris v0.2 Finance Phase 1 — implementation and verification

Scope: Project Expense Tracking only. Source implementation and tests are added;
compilation, tests, OpenAPI generation, migrations and deployment were not run in this task.
The user's final correction overrides the draft PRD: **Expense currency cannot be PATCHed;
changing currency requires deletion and recreation.** Half-up rounding is approved.

## 1. Changed files

New production files:

- `drizzle/0003_finance_project_expenses.sql`
- `src/lib/finance-money.ts`, `src/lib/finance-validation.ts`
- `src/schemas/finance.ts`
- `src/providers/exchange-rate-provider.ts`, `src/providers/frankfurter.ts`
- `src/services/finance-settings.ts`, `src/services/exchange-rates.ts`, `src/services/expenses.ts`
- `src/routes/finance.ts`, `src/routes/expenses.ts`
- `src/controllers/finance.ts`, `src/controllers/expenses.ts`

Existing integration files changed:

- `src/db/schema.ts`, `src/app.ts`, `src/index.ts`
- `src/lib/error-codes.ts`, `src/lib/response.ts`, `src/controllers/service-errors.ts`
- `wrangler.jsonc` (daily cron only)
- `skills/iris/SKILL.md`
- `tests/routes.test.ts` (new error codes), `tests/schema.test.ts` (three new tables)

New tests: `tests/finance-money.test.ts`, `tests/finance-services.test.ts`,
`tests/finance-routes.test.ts`, `tests/finance-fx.test.ts`, `tests/finance-schema.test.ts`,
and shared `tests/finance-fixture.ts`.

New documentation: `skills/iris/references/finance-api.md` and this file.
The already-staged `docs/04_Iris_Finance_v0.2.1.md` is preserved unchanged.

## 2. Migrations added

`0003_finance_project_expenses.sql` is additive. It creates only Finance tables and their
checks/index. No v0.1 table is rebuilt, altered or backfilled; old migrations are untouched.
No migration was applied, locally or remotely.

## 3. Tables added

| Table | Identity / ownership | Stored meaning |
| --- | --- | --- |
| finance_settings | user_id PK and user FK | Explicit reporting currency, created/updated epoch-ms |
| exchange_rates | (base_currency, quote_currency) PK; global | Current positive scaled rate, source, provider date, fetched/updated epoch-ms |
| expenses | UUID v4; user and Project FKs | Positive minor-unit amount, original/reporting currencies, copied scaled rate, metadata and epoch-ms times |

Expense index: `(user_id, project_id, occurred_at)`. No speculative category/currency indexes.
SQLite checks reject non-integer, nonpositive and unsafe stored amount/rate values, and
non-uppercase/non-ASCII currency codes. Ownership checks also run in services.

## 4. FinanceSettings API

GET/PUT `/api/v1/finance/settings`. PUT upserts with `reporting_currency` and returns 200.
GET missing settings returns 422 `FINANCE_SETTINGS_REQUIRED`. No user-default fallback.
Settings changes affect future expenses only; response fields are camelCase.

## 5. ExchangeRate API

GET `/api/v1/finance/exchange-rates`, optional `base_currency`/`quote_currency` filters.
Always a list. Public fields: baseCurrency, quoteCurrency, rate, source, rateDate, fetchedAt.
Rate is an 8-decimal string. No HTTP write/sync endpoint.

## 6. Expense API

GET/POST `/api/v1/projects/{projectId}/expenses`.
GET/PATCH/DELETE `/api/v1/projects/{projectId}/expenses/{expenseId}`.
Create returns 201; reads/PATCH 200; DELETE 204 with no body. All use Bearer auth and
user/Project scope. Create requires amount/currency/occurred_at. Category and description
are optional/nullable; category is trimmed and nonempty when supplied as a string.
List filters from/to/currency/category, orders by occurred_at DESC, and has no pagination.
from/to are timezone-aware ISO timestamps, inclusive, and must be ordered.

## 7. Expense Summary API

GET `/api/v1/projects/{projectId}/expenses/summary`, registered before the expense-ID route.
Accepts from/to/category only. Returns count, originalTotals, reportingTotals.
The empty result contains zero and two empty arrays. No global summary endpoint.

## 8. Money fixed-point implementation

Decimal string → BigInt → bounded exact integer for D1. No float multiplication/toFixed.
Input > currency precision is rejected, including extra trailing zeroes. Value >
Number.MAX_SAFE_INTEGER after scaling is rejected. String length <= 32.
USD/CNY use 2 minor units; JPY 0; KWD and six other codes 3; CLF/UYW 4.
A small explicit exception map defines precision; other three-ASCII-letter codes use 2.
This syntax contract does not guarantee ISO membership or provider coverage.
All reporting calculations and summary accumulation use BigInt, including totals beyond
the JS safe integer range. Responses remain decimal strings.

## 9. FX fixed-point implementation

FX_RATE_SCALE = 100_000_000. Explicit rates accept at most 8 decimals and must be positive,
with scaled integer <= Number.MAX_SAFE_INTEGER. Explicit excess precision is rejected,
never rounded. Database and API do not expose floating-point stored rates.

## 10. Frankfurter provider implementation

Thin ExchangeRateProvider interface with one implementation; native fetch, no SDK/key.
Official docs checked on 2026-09-22: https://frankfurter.dev/.
GET `https://api.frankfurter.dev/v2/rates?base=<currency>` returns an array of
`{ date, base, quote, rate }`. HTTP 400/404/422 errors have a JSON message; all non-2xx
statuses, transport/timeout failures and malformed data fail the sync for that currency.
Fetch timeout: 15 seconds. Validation rejects empty arrays, invalid dates/codes/rates,
wrong bases, duplicate quotes and self pairs; every returned row is checked before writing.
Provider dates can legitimately vary by row. A smaller valid response cannot prove that
the provider omitted a currency; unreturned cached pairs are retained, never deleted.

## 11. Rate inversion strategy

Provider reports reportingCurrency → X; storage needs X → reportingCurrency.
JSON numeric rates become decimal strings immediately. The helper reconstructs a BigInt
rational (including exponent notation), calculates its inverse and rounds half up to 8
decimals. It rejects inverses that round to zero or exceed the safe storage range.
Example: CNY→USD 0.1404 becomes USD→CNY 7.12250712.

## 12. Daily Cron implementation

Existing Worker entrypoint now exports `{ fetch: app.fetch, scheduled }`.
Wrangler cron `0 20 * * *`: daily at 20:00 UTC / next day 04:00 Asia/Shanghai.
Sync reads distinct configured reporting currencies; no settings means no fetch.
Bindings, database names, existing vars and secrets are unchanged. No API key is added.

## 13. Sync failure strategy

Fetch → parse → validate every row → normalize/invert every row → D1 transactional batch.
One upsert statement per pair avoids a large SQL bind-parameter list. Any write failure
rolls back the currency's entire batch. Fetch/validation errors leave its cache unchanged;
the loop still attempts other currencies. Older observations/provider dates cannot overwrite
newer cache entries. No deletes, distributed transaction or retry framework.
Structured logs contain provider, reportingCurrency, event, rateCount, rateDates and fetchedAt;
error metadata is fixed/sanitized. Successful rateCount means validated pairs processed,
including guarded upserts that retain a newer existing row. No full payloads or secrets.
The scheduled invocation reports failure after all currencies have been attempted if any failed.

## 14. Expense rate resolution strategy

Project ownership → explicit FinanceSettings → amount/currency validation → rate resolution:
explicit exchange_rate first, then same-currency 1, else exact cache lookup.
Explicit rate wins even for same currencies. Missing cache returns EXCHANGE_RATE_NOT_FOUND.
No live provider request, inverse-pair fallback, multi-hop or historical lookup in CREATE.
The actual rate and current reporting currency are copied into the expense.

## 15. PATCH rate semantics

Only amount, exchange_rate, category, description and occurred_at can be PATCHed.
Currency/reporting_currency, IDs, ownership and created_at are rejected by strict schema,
even when unchanged. Direct service PATCH also validates the strict schema before writing.
Amount/metadata/time changes retain the stored rate; explicit exchange_rate replaces it.
No current settings/cache reads occur during PATCH. Omitted columns are not overwritten.
Changing currency uses DELETE plus CREATE; this sequence is not atomic and not automated.

## 16. Summary calculation strategy

Each expense's reporting minor amount is half-up rounded from:
`amount_minor × exchange_rate_scaled × 10^reporting_precision / (10^8 × 10^original_precision)`.
Summary groups original minor amounts by original currency and sums per-expense rounded
reporting minor amounts by stored reporting currency. This matches displayed details.
No current FX/settings query. Reporting currencies are never mixed into one total.

## 17. New error codes

FINANCE_SETTINGS_REQUIRED (422), EXPENSE_NOT_FOUND (404), EXCHANGE_RATE_NOT_FOUND (422),
INVALID_MONEY_AMOUNT, INVALID_CURRENCY and INVALID_EXCHANGE_RATE.
The last three use 400 for route-level field-shape failures and 422 for service-level domain
failures (e.g. nonpositive/overflow/excess money precision). Unknown/immutable fields and
invalid timestamp/category/filter shapes use BAD_REQUEST (400).
v0.1's global validation hook is unchanged; Finance has a route-local hook.

## 18. Security / user isolation

All Finance routes require the existing Bearer middleware. Identity comes only from Context.
Settings filter user_id; expense service operations verify Project ownership and scope every
item mutation/read by user_id + project_id + expense_id. FX is shared authenticated reference
data. Strict bodies reject supplied ownership/internal fields. Logs contain no financial payloads.

## 19. Tests added

Five Finance suites plus one fixture file cover helpers, services, routes/OpenAPI, schema,
mocked provider/sync and scheduled handler. Cases include USD/CNY/JPY/KWD/CLF, integer limits,
half-up ties, historical FX/settings freezing, list/summary filters, user isolation, immutable
currency PATCH, delete/recreate, provider errors and per-currency D1 rollback.
Original requirements' currency-change PATCH tests are replaced by rejection and recreation
tests, matching the user's correction. Existing exact table/error lists are extended only.
**Tests and typecheck have not been run.** Review is static, not runtime verification.

## 20. OpenAPI update status

Real schemas and all nine routes are registered; source API version is now 0.2.0.
`skills/iris/references/openapi.json` remains untouched: **Pending regeneration**.
Use the existing export/check commands below; no generated JSON was hand-edited.

## 21. finance-api.md update

Added compact route, field, precision, rate, immutable-currency, time-filter, error and
Agent-example reference. It explicitly separates D1 finance from Markdown/Git content.

## 22. SKILL.md update

Added Finance trigger/scope, mutation verification and progressive loading.
Finance loads finance-api.md; Project resolution adds project-api.md only.
Existing non-Finance workflows are retained. Internal FX cron is not a general Scheduler.

## 23. Documentation/API inconsistencies discovered

- Draft PRD allowed currency PATCH; the latest user instruction supersedes it. The staged
  PRD is preserved; new source/reference/tests state immutable currency.
- Repository has modular references, but the main Skill still used the monolithic api-guide
  for existing workflows. Finance now has its own explicit loading path without expanding
  this task into a rewrite of other workflows.
- Existing project-api.md links to absent content-api.md; unrelated content documentation
  remains unchanged.
- Generated OpenAPI and api-guide.md's historical version/count claims predate Finance.
  The generated file awaits export; the new Finance reference states deployment status separately.

## 24. Intentionally out of scope / rollback

No Income, Account, Balance, Budget, bookkeeping, bank sync, historical FX DB, snapshot entity,
global expense summary, recurring expenses, Reminder, Notification, finance rules, autonomous
finance agent or finance Markdown/Git storage. No production calls/writes, migrations, deployment
or git push were performed.
Before deployment, rollback is reverting only this task's changes. After deployment, rollback
the Worker/cron as needed while retaining the additive tables and any expenses; do not drop
financial data as an automatic rollback. Old v0.1 code can ignore the new tables.

## 25. Exact commands and retest steps

Run from the repository root. Commands below are provided for the user; none were executed
as part of implementation. If dependencies need restoring, use `pnpm install --frozen-lockfile`.

```sh
cd /Users/apple/Desktop/Project/iris_assisant

# Local migration only; preserves v0.1 records.
pnpm run db:migrate:local

# Focused tests; FX requests are mocked and D1 is the isolated test binding.
pnpm exec vitest run tests/finance-money.test.ts tests/finance-schema.test.ts tests/finance-services.test.ts tests/finance-routes.test.ts tests/finance-fx.test.ts

# Full regression and static type checking.
pnpm run test
pnpm run typecheck

# Generate OpenAPI from the app, then verify the generated artifact.
pnpm run openapi:export
pnpm run openapi:check

# Optional local bundling check; does not deploy.
pnpm run bundle:check

# Scheduled entrypoint test with mocked Frankfurter (no internet dependency).
pnpm exec vitest run tests/finance-fx.test.ts -t 'scheduled entrypoint'
```

Retest acceptance sequence (covered by the suites):

1. Confirm missing settings errors, then PUT CNY and check user isolation.
2. Mock-sync USD→CNY, create CNY and USD expenses, and create one with explicit 7.1843.
3. Change cached FX; old expense/summary must stay fixed and a new expense must use the new rate.
4. PATCH amount/metadata/time; rate stays fixed. Explicit rate PATCH changes only the rate.
5. PATCH currency, including the same currency, must fail without changing anything.
6. Delete the resolved record and create a replacement in another currency; verify a new ID.
7. Change settings to USD; old expenses retain CNY reporting currency; summary groups both.
8. Exercise precision/overflow/ties, time/category filters and cross-user/Project access failures.
9. Mock HTTP/malformed/invalid/DB failures; old cache remains intact and other currencies continue.
10. Export OpenAPI; confirm the nine operations, immutable PATCH schema and decimal string responses.

Optional manual local trigger (uses real Frankfurter **only if local FinanceSettings exist**;
the mocked scheduled test above is the network-free path):

```sh
pnpm exec wrangler dev --local --test-scheduled --ip 127.0.0.1 --port 8787
```

In a second terminal:

```sh
curl 'http://127.0.0.1:8787/__scheduled?cron=0+20+%2A+%2A+%2A'
```

Future production rollout, only when the user chooses to release and local checks pass:

```sh
pnpm run db:migrate:remote
pnpm run deploy
```

Apply the additive migration before deploying the Worker/cron. These commands mutate
production; they are listed for later use and have not been run. No credentials belong
in the command text or this document.
