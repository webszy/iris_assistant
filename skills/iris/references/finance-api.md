# Finance API — Project Expense Tracking

Use the configuration, authentication, target-resolution and read-before-write protocol
in [SKILL.md](../SKILL.md). Finance is D1 structured state, never Markdown/Git content.
This reference describes the Finance Phase 1 source contract. Deployment and generated
OpenAPI regeneration are separate steps; do not assume a deployment supports new routes.

## Routes

All routes require Bearer auth. Success is `{ "success": true, "data": ... }` unless noted.
Lists always return arrays, including zero/one matching exchange-rate pair.

| Method | Path | Result |
| --- | --- | --- |
| GET | `/api/v1/finance/settings` | User's settings; missing → 422 `FINANCE_SETTINGS_REQUIRED` |
| PUT | `/api/v1/finance/settings` | Upsert settings, 200 |
| GET | `/api/v1/finance/exchange-rates` | Shared current FX cache, 200 |
| GET | `/api/v1/projects/{projectId}/expenses` | Project expense list, 200 |
| POST | `/api/v1/projects/{projectId}/expenses` | Create expense, 201 |
| GET | `/api/v1/projects/{projectId}/expenses/summary` | Project totals, 200 |
| GET | `/api/v1/projects/{projectId}/expenses/{expenseId}` | One expense, 200 |
| PATCH | `/api/v1/projects/{projectId}/expenses/{expenseId}` | Update allowed fields, 200 |
| DELETE | `/api/v1/projects/{projectId}/expenses/{expenseId}` | Hard delete only this expense, 204, empty body |

## Settings and currency

PUT body: `{ "reporting_currency": "CNY" }`. No default is inferred from the user,
Project, expense currency or `users.default_currency`. Settings are required even for
same-currency expenses or an explicit rate. A settings change affects only future expenses.
Response: `reportingCurrency`, `createdAt`, `updatedAt`.

Currency inputs require exactly three ASCII letters and normalize to uppercase.
This is an ISO-style syntax contract, not validation of a currency's existence/provider coverage.
Minor units: 0 for BIF, CLP, DJF, GNF, ISK, JPY, KMF, KRW, PYG, RWF, UGX, UYI, VND, VUV,
XAF, XOF, XPF; 3 for BHD, IQD, JOD, KWD, LYD, OMR, TND; 4 for CLF, UYW; otherwise 2.
An accepted three-letter code does not guarantee an available current FX rate.

## Exchange rates

Optional query: `base_currency`, `quote_currency`; either or both may be provided.
Response row: `baseCurrency`, `quoteCurrency`, `rate`, `source`, `rateDate`, `fetchedAt`.
Direction is always **1 baseCurrency = rate quoteCurrency**.
Example: USD/CNY `"7.12000000"` means 1 USD = 7.12 CNY. `rate` is an 8-decimal string.
`rateDate` is the provider's date (`YYYY-MM-DD`); `fetchedAt` is Iris's retrieval timestamp.
Rows may have different provider dates. Missing pair → empty list, not a fabricated rate.

The daily internal sync reads distinct configured reporting currencies, fetches Frankfurter
v2 once per currency, inverts its rates, and updates the current cache. Failures retain old
rates. Agents cannot POST/PATCH/DELETE FX or invoke an HTTP sync endpoint.
No freshness rejection is applied in this phase: the last successful cache remains usable.

## Create

Resolve the named Project first; never create or substitute a Project because an expense
mentions it. Read matching current expenses before writing to avoid an accidental duplicate.
Do not treat a matching amount alone as proof of duplication: repeated legitimate charges exist.

```json
{
  "amount": "120.50",
  "currency": "USD",
  "category": "ads",
  "description": "Meta Ads",
  "occurred_at": "2026-09-22T10:30:00+08:00"
}
```

Required: `amount`, `currency`, `occurred_at`. Optional: `exchange_rate`, `category`, `description`.
Unknown fields are rejected; never send internal minor-unit/scaled values or ownership IDs.
- `amount`: positive decimal string, no exponent/sign/whitespace. Reject excess precision
  (even zero fractional digits beyond currency precision). USD `"120.50"`, JPY `"120"`, KWD `"1.234"`.
- `exchange_rate`: positive decimal string, at most 8 decimals. E.g. `"7.1843"`.
- Both strings have a 32-character limit and must scale to an integer <= 9007199254740991.
- `occurred_at`: ISO timestamp with timezone, required; response is UTC, stored at millisecond precision.
  Resolve the user's intended date/time and timezone; do not invent a precise historical time.
- `category`: optional string, trimmed, 1–100 characters after trim; free text, not an enum.
- `description`: optional string, at most 4000 characters. Both metadata fields support null.

FX priority: **explicit rate → same reporting currency uses 1 → exact current cache pair**.
Explicit rate wins even for identical currencies. No cache hit → `EXCHANGE_RATE_NOT_FOUND`.
Expense creation never fetches Frankfurter, guesses FX or uses a multi-hop conversion.
Historical `occurred_at` still uses today's available cache unless the user specifies a rate;
there is no historical FX lookup. Explain this when recording historical costs.

Response fields: `id`, `projectId`, `amount`, `currency`, `reportingCurrency`, `exchangeRate`,
`reportingAmount`, `category`, `description`, `occurredAt`, `createdAt`, `updatedAt`.
No `amountMinor` or `exchangeRateScaled`. Money is formatted to currency precision;
`exchangeRate` always has 8 decimals. Each reporting amount rounds half up to its currency's
minor unit. An extremely small positive expense can display a reporting amount of zero.

## Update and delete

PATCH permits only `amount`, `exchange_rate`, `category`, `description`, `occurred_at`.
Omitted fields stay unchanged; null clears category/description.
**Both `currency` and `reporting_currency` are immutable.** Even submitting the same
currency is rejected. IDs, user/project ownership and `created_at` cannot be patched.
Changing amount, metadata or occurred_at preserves the stored exchange rate.
Only an explicit `exchange_rate` PATCH changes it; PATCH never consults settings/current FX.

To change currency, the user must authorize deleting the resolved old expense and adding
a replacement. Do not silently emulate a rejected PATCH as deletion. Before an authorized
replacement, resolve settings and the new rate and prepare the complete replacement data.
Delete then create is **not atomic**: if recreation fails, report that the old expense was
deleted and replacement is incomplete; do not claim a successful correction or retry blindly.

## Lists and summary

List query: `from`, `to`, `currency`, `category` (all optional).
Summary query: `from`, `to`, `category` only.
`from`/`to` filter **occurred_at**, both endpoints inclusive; from must not exceed to.
Use timezone-aware ISO timestamps, not date-only strings. For month queries, compute
the intended month's boundaries in the user's timezone (last millisecond for inclusive to).
Category is trimmed and matched exactly/case-sensitively. List order is occurred_at DESC
(ID DESC breaks ties); no pagination. Empty list → `[]`.

Summary data:
```json
{
  "count": 2,
  "originalTotals": [{ "currency": "CNY", "amount": "100.00" }, { "currency": "USD", "amount": "100.00" }],
  "reportingTotals": [{ "currency": "CNY", "amount": "812.00" }]
}
```
Arrays are sorted by currency. Original amounts group by original currency;
reporting amounts use each expense's stored FX and group by its stored reporting currency.
The summary sums **per-expense rounded amounts**, matching the displayed details.
Settings/cache changes never recalculate historical rows. Never add CNY and USD totals together.
Empty summary → count 0 and two empty arrays. Use this endpoint rather than LLM arithmetic.
No global summary route exists.

## Agent examples

- “DeepUsername 今天 Facebook 花了 120 美元”：resolve DeepUsername → read possible duplicates
  → create amount `"120"`, currency USD, category ads, description Facebook/Meta Ads, intended
  occurred_at → verify. Use the cache automatically; do not demand a current FX rate from the user.
- “AWS 扣了 100 美元，信用卡实际按 7.1843 算”：resolve the owning Project (ask if absent)
  → create with explicit `exchange_rate: "7.1843"` and intended occurred_at → verify.
- “DeepUsername 这个月花了多少钱”：resolve Project → summary with the intended month filter
  → report each reporting-currency total separately.

## Errors and recovery

- 400 `BAD_REQUEST`: unknown/immutable fields, invalid metadata or time range.
- 400 `INVALID_CURRENCY` / `INVALID_MONEY_AMOUNT` / `INVALID_EXCHANGE_RATE`: field shape invalid.
- 422 `INVALID_MONEY_AMOUNT` / `INVALID_EXCHANGE_RATE`: nonpositive, excess currency precision,
  or outside safe fixed-point range. Correct only within the user's intent, never silently round input.
- 422 `FINANCE_SETTINGS_REQUIRED`: ask for an explicit reporting currency; do not default it.
- 422 `EXCHANGE_RATE_NOT_FOUND`: explain missing cache; wait for sync or use the user's explicit
  actual rate. Do not invent a rate, invoke a write-FX endpoint or request provider credentials.
- 401 `UNAUTHORIZED`: follow the main Skill credential protocol.
- 404 `PROJECT_NOT_FOUND` / `EXPENSE_NOT_FOUND`: missing or outside user/Project scope; do not
  infer creation/deletion authority from failure.

Verify mutation responses and identities; DELETE verification expects 204 and, when needed,
a subsequent item 404. After an uncertain POST outcome, read matching expenses before retrying.
No idempotency-key or duplicate-prevention database constraint is provided in Phase 1.

Load only this reference for Finance; add [project-api.md](project-api.md) only to resolve Projects.
Use relevant [openapi.json](openapi.json) sections for exact schema, unexpected errors, debugging
or drift. Do not auto-load content/resource/capability references, or mirror finance data into Git.
