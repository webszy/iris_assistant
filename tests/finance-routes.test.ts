import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { createExpense, getExpense } from "../src/services/expenses";
import { apiFetch, readJson } from "./helpers";
import { financeFixture, OCCURRED_AT, seedRate } from "./finance-fixture";

const newBody = { amount: "120.50", currency: "usd", category: " ads ", description: "Meta Ads", occurred_at: OCCURRED_AT };

async function expectError(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(await response.json()).toMatchObject({ success: false, error: { code } });
}

describe("Finance routes", () => {
  it.each([
    ["GET", "/api/v1/finance/settings"], ["PUT", "/api/v1/finance/settings"], ["GET", "/api/v1/finance/exchange-rates"],
    ["GET", "/api/v1/projects/x/expenses"], ["POST", "/api/v1/projects/x/expenses"], ["GET", "/api/v1/projects/x/expenses/summary"],
    ["GET", "/api/v1/projects/x/expenses/y"], ["PATCH", "/api/v1/projects/x/expenses/y"], ["DELETE", "/api/v1/projects/x/expenses/y"],
  ])("%s %s requires auth before validation", async (method, path) => {
    await expectError(await apiFetch(path, { method }), 401, "UNAUTHORIZED");
  });

  it("GET missing settings / PUT create+update expose the common envelope and camelCase fields", async () => {
    const f = await financeFixture(null);
    const token = f.identity.rawToken;
    await expectError(await apiFetch("/api/v1/finance/settings", { token }), 422, "FINANCE_SETTINGS_REQUIRED");
    for (const currency of ["cny", "usd"]) {
      const response = await apiFetch("/api/v1/finance/settings", { method: "PUT", token, body: { reporting_currency: currency } });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ success: true, data: { reportingCurrency: currency.toUpperCase(), createdAt: expect.any(String), updatedAt: expect.any(String) } });
    }
    const read = await apiFetch("/api/v1/finance/settings", { token });
    expect(await read.json()).toMatchObject({ success: true, data: { reportingCurrency: "USD" } });
    await expectError(await apiFetch("/api/v1/finance/settings", { method: "PUT", token, body: { reportingCurrency: "CNY" } }), 400, "BAD_REQUEST");
    const other = await financeFixture(null);
    await expectError(await apiFetch("/api/v1/finance/settings", { token: other.identity.rawToken }), 422, "FINANCE_SETTINGS_REQUIRED");
  });

  it.each(["$", "人民币", "US Dollar", "USDD", " CNY", "CNY\n", 123, null])("invalid currency %s gets INVALID_CURRENCY", async (value) => {
    const f = await financeFixture();
    await expectError(await apiFetch("/api/v1/finance/settings", { method: "PUT", token: f.identity.rawToken, body: { reporting_currency: value } }), 400, "INVALID_CURRENCY");
  });

  it("exchange-rate filters are uniform read-only lists and hide scaled integers", async () => {
    const f = await financeFixture();
    await seedRate();
    await seedRate("EUR", "CNY", "8");
    const token = f.identity.rawToken;
    const response = await apiFetch("/api/v1/finance/exchange-rates?base_currency=usd&quote_currency=cny", { token });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, data: [{
      baseCurrency: "USD", quoteCurrency: "CNY", rate: "7.12000000", source: "frankfurter", rateDate: "2026-09-21", fetchedAt: "2026-09-21T20:00:00.000Z",
    }] });
    const partial = await readJson<{ data: unknown[] }>(await apiFetch("/api/v1/finance/exchange-rates?quote_currency=cny", { token }));
    expect(partial.data).toHaveLength(2);
    expect(await (await apiFetch("/api/v1/finance/exchange-rates?base_currency=jpy", { token })).json()).toEqual({ success: true, data: [] });
    for (const method of ["POST", "PATCH", "DELETE"]) {
      await expectError(await apiFetch("/api/v1/finance/exchange-rates", { method, token }), 404, "NOT_FOUND");
    }
    await expectError(await apiFetch("/api/v1/finance/exchange-rates?base_currency=USDD", { token }), 400, "INVALID_CURRENCY");
  });

  it("create uses snake_case, returns normalized camelCase values and UTC time", async () => {
    const f = await financeFixture();
    await seedRate();
    const response = await apiFetch(f.basePath, { method: "POST", token: f.identity.rawToken, body: newBody });
    expect(response.status).toBe(201);
    const result = await readJson<{ success: boolean; data: Record<string, unknown> }>(response);
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ id: expect.any(String), projectId: f.projectId, amount: "120.50", currency: "USD", reportingCurrency: "CNY",
      exchangeRate: "7.12000000", reportingAmount: "857.96", category: "ads", description: "Meta Ads",
      occurredAt: "2026-09-22T02:30:00.000Z", createdAt: expect.any(String), updatedAt: expect.any(String) });
    const item = await apiFetch(`${f.basePath}/${result.data.id}`, { token: f.identity.rawToken });
    expect(await item.json()).toEqual(result);
  });

  it.each([
    [{ amount: 1 }, 400, "INVALID_MONEY_AMOUNT"], [{ amount: "-1" }, 400, "INVALID_MONEY_AMOUNT"],
    [{ amount: "1\n" }, 400, "INVALID_MONEY_AMOUNT"], [{ exchange_rate: "1\n" }, 400, "INVALID_EXCHANGE_RATE"],
    [{ amount: "0" }, 422, "INVALID_MONEY_AMOUNT"], [{ amount: "1.001" }, 422, "INVALID_MONEY_AMOUNT"],
    [{ exchange_rate: "0" }, 422, "INVALID_EXCHANGE_RATE"], [{ exchange_rate: "1.123456789" }, 400, "INVALID_EXCHANGE_RATE"],
    [{ exchange_rate: 1 }, 400, "INVALID_EXCHANGE_RATE"], [{ currency: "USDD" }, 400, "INVALID_CURRENCY"],
    [{ category: "   " }, 400, "BAD_REQUEST"], [{ category: "a".repeat(101) }, 400, "BAD_REQUEST"],
    [{ occurred_at: "2026-09-22" }, 400, "BAD_REQUEST"], [{ occurred_at: "2026-02-30T00:00:00Z" }, 400, "BAD_REQUEST"],
    [{ occurred_at: undefined }, 400, "BAD_REQUEST"], [{ occurred_at: "2026-09-22T10:30:00" }, 400, "BAD_REQUEST"],
    [{ amount_minor: 1 }, 400, "BAD_REQUEST"], [{ user_id: "x" }, 400, "BAD_REQUEST"],
    [{ reporting_currency: "USD" }, 400, "BAD_REQUEST"], [{ task_id: "x" }, 400, "BAD_REQUEST"],
  ] as const)("rejects invalid create fields %j", async (patch, status, code) => {
    const f = await financeFixture();
    await expectError(await apiFetch(f.basePath, { method: "POST", token: f.identity.rawToken,
      body: { ...newBody, currency: "CNY", ...patch } }), status, code);
  });

  it("missing settings/rate have explicit codes and create no fallback", async () => {
    const f = await financeFixture(null);
    await expectError(await apiFetch(f.basePath, { method: "POST", token: f.identity.rawToken, body: newBody }), 422, "FINANCE_SETTINGS_REQUIRED");
    const configured = await financeFixture();
    await expectError(await apiFetch(configured.basePath, { method: "POST", token: configured.identity.rawToken, body: newBody }), 422, "EXCHANGE_RATE_NOT_FOUND");
  });

  it("summary static path is reachable, validates filters and cannot be treated as an expense ID", async () => {
    const f = await financeFixture();
    const token = f.identity.rawToken;
    const summary = await apiFetch(`${f.basePath}/summary`, { token });
    expect(summary.status).toBe(200);
    expect(await summary.json()).toEqual({ success: true, data: { count: 0, originalTotals: [], reportingTotals: [] } });
    for (const query of ["from=invalid", "currency=USD", "from=2026-09-30T00:00:00Z&to=2026-09-01T00:00:00Z"]) {
      await expectError(await apiFetch(`${f.basePath}/summary?${query}`, { token }), 400, "BAD_REQUEST");
    }
    await expectError(await apiFetch(`${f.basePath}?currency=USDD`, { token }), 400, "INVALID_CURRENCY");
  });

  it("rejects every currency PATCH (including same currency/explicit FX), preserving all fields", async () => {
    const f = await financeFixture();
    const old = await createExpense(f.db, f.userId, f.projectId, { amount: "100", currency: "CNY", occurred_at: OCCURRED_AT });
    const token = f.identity.rawToken;
    for (const body of [{ currency: "USD" }, { currency: "CNY" }, { currency: "JPY", amount: "20", exchange_rate: "0.05" },
      { reporting_currency: "USD" }, { id: "x" }, { user_id: "x" }, { project_id: "x" }, { created_at: OCCURRED_AT }]) {
      await expectError(await apiFetch(`${f.basePath}/${old.id}`, { method: "PATCH", token, body }), 400, "BAD_REQUEST");
    }
    expect(await getExpense(f.db, f.userId, f.projectId, old.id)).toEqual(old);
    const amount = await apiFetch(`${f.basePath}/${old.id}`, { method: "PATCH", token, body: { amount: "200" } });
    expect(await amount.json()).toMatchObject({ success: true, data: { amount: "200.00", currency: "CNY", exchangeRate: "1.00000000" } });
    const removed = await apiFetch(`${f.basePath}/${old.id}`, { method: "DELETE", token });
    expect(removed.status).toBe(204);
    expect(await removed.text()).toBe("");
    await expectError(await apiFetch(`${f.basePath}/${old.id}`, { token }), 404, "EXPENSE_NOT_FOUND");
    const recreated = await apiFetch(f.basePath, { method: "POST", token, body: { ...newBody, currency: "JPY", amount: "200", exchange_rate: "0.05" } });
    expect(recreated.status).toBe(201);
    expect(await recreated.json()).toMatchObject({ data: { currency: "JPY", amount: "200", reportingAmount: "10.00" } });
  });

  it("cannot access another user's Project or guess an Expense ID under own Project", async () => {
    const f = await financeFixture();
    const other = await financeFixture();
    const old = await createExpense(f.db, f.userId, f.projectId, { amount: "1", currency: "CNY", occurred_at: OCCURRED_AT });
    const token = other.identity.rawToken;
    for (const method of ["GET", "PATCH", "DELETE"]) {
      const body = method === "PATCH" ? { amount: "2" } : undefined;
      await expectError(await apiFetch(`${f.basePath}/${old.id}`, { method, token, body }), 404, "PROJECT_NOT_FOUND");
      await expectError(await apiFetch(`${other.basePath}/${old.id}`, { method, token, body }), 404, "EXPENSE_NOT_FOUND");
    }
    await expectError(await apiFetch(f.basePath, { method: "POST", token, body: newBody }), 404, "PROJECT_NOT_FOUND");
    await expectError(await apiFetch(`${f.basePath}/summary`, { token }), 404, "PROJECT_NOT_FOUND");
    expect(await getExpense(f.db, f.userId, f.projectId, old.id)).toEqual(old);
  });
});

describe("Finance live OpenAPI source", () => {
  it("documents all nine operations, strict immutable currency PATCH, string money and protected routes", async () => {
    const response = await SELF.fetch("https://iris.test/openapi.json");
    expect(response.status).toBe(200);
    const doc = await readJson<{
      paths: Record<string, Record<string, { security?: unknown; responses?: Record<string, unknown> }>>;
      components: { schemas: Record<string, { properties?: Record<string, unknown>; additionalProperties?: boolean; required?: string[] }> };
    }>(response);
    const paths: [string, string[]][] = [
      ["/api/v1/finance/settings", ["get", "put"]], ["/api/v1/finance/exchange-rates", ["get"]],
      ["/api/v1/projects/{projectId}/expenses", ["get", "post"]], ["/api/v1/projects/{projectId}/expenses/summary", ["get"]],
      ["/api/v1/projects/{projectId}/expenses/{expenseId}", ["get", "patch", "delete"]],
    ];
    for (const [path, methods] of paths) for (const method of methods) {
      expect(doc.paths[path]?.[method]?.security).toEqual([{ bearerAuth: [] }]);
      expect(doc.paths[path]?.[method]?.responses).toHaveProperty("401");
    }
    expect(Object.keys(doc.paths["/api/v1/finance/exchange-rates"] ?? {})).toEqual(["get"]);
    expect(doc.paths).not.toHaveProperty("/api/v1/finance/expenses/summary");
    const patch = doc.components.schemas.UpdateExpenseRequest;
    expect(patch?.additionalProperties).toBe(false);
    expect(patch?.properties).not.toHaveProperty("currency");
    expect(patch?.properties).not.toHaveProperty("reporting_currency");
    expect(doc.components.schemas.CreateExpenseRequest?.required).toEqual(expect.arrayContaining(["amount", "currency", "occurred_at"]));
    expect(doc.components.schemas.Expense?.properties?.amount).toMatchObject({ type: "string" });
    expect(doc.components.schemas.Expense?.properties).not.toHaveProperty("amountMinor");
    expect(doc.components.schemas.ExchangeRate?.properties).not.toHaveProperty("rateScaled");
  });
});
