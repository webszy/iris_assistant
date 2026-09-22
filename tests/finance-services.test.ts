import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exchangeRates } from "../src/db/schema";
import { createExpense, deleteExpense, getExpense, listExpenses, summarizeExpenses, updateExpense } from "../src/services/expenses";
import { getFinanceSettings, putFinanceSettings } from "../src/services/finance-settings";
import { financeFixture, OCCURRED_AT, seedRate } from "./finance-fixture";

beforeEach(() => {
  // Any accidental live fetch in an Expense/Settings path fails the test.
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Finance CRUD must not access the network"); }));
});
afterEach(() => vi.unstubAllGlobals());

describe("FinanceSettings services", () => {
  it("missing settings never inherits users.default_currency", async () => {
    const f = await financeFixture(null);
    await expect(getFinanceSettings(f.db, f.userId)).rejects.toMatchObject({ code: "FINANCE_SETTINGS_REQUIRED" });
    await expect(createExpense(f.db, f.userId, f.projectId, { amount: "1", currency: "CNY", occurred_at: OCCURRED_AT, exchange_rate: "1" }))
      .rejects.toMatchObject({ code: "FINANCE_SETTINGS_REQUIRED" });
    expect(await env.DB.prepare("SELECT * FROM finance_settings WHERE user_id = ?").bind(f.userId).first()).toBeNull();
  });
  it("upserts one uppercase row, preserves createdAt, and isolates users", async () => {
    const f = await financeFixture(null);
    const other = await financeFixture("JPY");
    const first = await putFinanceSettings(f.db, f.userId, { reporting_currency: "cny" });
    const second = await putFinanceSettings(f.db, f.userId, { reporting_currency: "usd" });
    expect(first.reportingCurrency).toBe("CNY");
    expect(second).toMatchObject({ reportingCurrency: "USD", createdAt: first.createdAt });
    expect(await getFinanceSettings(f.db, other.userId)).toMatchObject({ reportingCurrency: "JPY" });
    expect((await env.DB.prepare("SELECT * FROM finance_settings WHERE user_id = ?").bind(f.userId).all()).results).toHaveLength(1);
    await expect(putFinanceSettings(f.db, f.userId, { reporting_currency: "$" })).rejects.toMatchObject({ code: "INVALID_CURRENCY" });
    expect(await getFinanceSettings(f.db, f.userId)).toMatchObject({ reportingCurrency: "USD" });
  });
});

describe("Expense services", () => {
  it("same currency uses one; explicit value wins even for same currency", async () => {
    const f = await financeFixture();
    const same = await createExpense(f.db, f.userId, f.projectId, { amount: "100", currency: "cny", occurred_at: OCCURRED_AT });
    expect(same).toMatchObject({ amount: "100.00", currency: "CNY", exchangeRate: "1.00000000", reportingAmount: "100.00", occurredAt: "2026-09-22T02:30:00.000Z" });
    const explicit = await createExpense(f.db, f.userId, f.projectId, { amount: "100", currency: "CNY", occurred_at: OCCURRED_AT, exchange_rate: "1.5" });
    expect(explicit.reportingAmount).toBe("150.00");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("uses directional current cache even for historical occurred_at; future rate updates only affect new expenses", async () => {
    const f = await financeFixture();
    await seedRate();
    const body = { amount: "100", currency: "USD", occurred_at: "2020-01-01T00:00:00Z" };
    const old = await createExpense(f.db, f.userId, f.projectId, body);
    await seedRate("USD", "CNY", "7.18");
    const recent = await createExpense(f.db, f.userId, f.projectId, body);
    expect(old.exchangeRate).toBe("7.12000000");
    expect((await getExpense(f.db, f.userId, f.projectId, old.id)).reportingAmount).toBe("712.00");
    expect(recent.reportingAmount).toBe("718.00");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("explicit FX overrides cache and works when cache is absent", async () => {
    const f = await financeFixture();
    await seedRate();
    const body = { amount: "100", currency: "USD", occurred_at: OCCURRED_AT, exchange_rate: "7.1843" };
    expect(await createExpense(f.db, f.userId, f.projectId, body)).toMatchObject({ exchangeRate: "7.18430000", reportingAmount: "718.43" });
    await f.db.delete(exchangeRates);
    expect(await createExpense(f.db, f.userId, f.projectId, body)).toMatchObject({ exchangeRate: "7.18430000" });
  });
  it("missing directional rate rejects without a fallback, multi-hop, fetch or insert", async () => {
    const f = await financeFixture();
    await seedRate("CNY", "USD", "0.14");
    await seedRate("USD", "EUR", "0.9");
    await seedRate("EUR", "CNY", "8");
    await expect(createExpense(f.db, f.userId, f.projectId, { amount: "100", currency: "USD", occurred_at: OCCURRED_AT }))
      .rejects.toMatchObject({ code: "EXCHANGE_RATE_NOT_FOUND" });
    expect(await listExpenses(f.db, f.userId, f.projectId, {})).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(["0", "0.00", "1.001", "90071992547409.92"])("rejects invalid persisted amount %s", async (amount) => {
    const f = await financeFixture();
    await expect(createExpense(f.db, f.userId, f.projectId, { amount, currency: "CNY", occurred_at: OCCURRED_AT }))
      .rejects.toMatchObject({ code: "INVALID_MONEY_AMOUNT" });
  });
  it.each(["0", "0.00000000", "90071992.54740992"])("rejects invalid persisted rate %s", async (rate) => {
    const f = await financeFixture();
    await expect(createExpense(f.db, f.userId, f.projectId, { amount: "1", currency: "USD", exchange_rate: rate, occurred_at: OCCURRED_AT }))
      .rejects.toMatchObject({ code: "INVALID_EXCHANGE_RATE" });
  });
  it("patching amount/metadata/time preserves FX and stored reporting currency after settings change", async () => {
    const f = await financeFixture();
    await seedRate();
    const old = await createExpense(f.db, f.userId, f.projectId, { amount: "100", currency: "USD", occurred_at: OCCURRED_AT });
    await putFinanceSettings(f.db, f.userId, { reporting_currency: "USD" });
    await f.db.delete(exchangeRates);
    const amount = await updateExpense(f.db, f.userId, f.projectId, old.id, { amount: "120.50" });
    expect(amount).toMatchObject({ reportingAmount: "857.96", exchangeRate: "7.12000000", reportingCurrency: "CNY" });
    const metadata = await updateExpense(f.db, f.userId, f.projectId, old.id, { category: " ads ", description: "Meta Ads" });
    expect(metadata).toMatchObject({ category: "ads", exchangeRate: old.exchangeRate });
    const time = await updateExpense(f.db, f.userId, f.projectId, old.id, { occurred_at: "2019-01-01T00:00:00Z" });
    expect(time).toMatchObject({ exchangeRate: old.exchangeRate, reportingCurrency: "CNY", createdAt: old.createdAt });
    const changed = await updateExpense(f.db, f.userId, f.projectId, old.id, { exchange_rate: "7.1843" });
    expect(changed).toMatchObject({ exchangeRate: "7.18430000", reportingCurrency: "CNY" });
    const cleared = await updateExpense(f.db, f.userId, f.projectId, old.id, { category: null, description: null });
    expect(cleared).toMatchObject({ category: null, description: null, exchangeRate: "7.18430000" });
    const next = await createExpense(f.db, f.userId, f.projectId, { amount: "1", currency: "USD", occurred_at: OCCURRED_AT });
    expect(next).toMatchObject({ reportingCurrency: "USD", exchangeRate: "1.00000000" });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("strict PATCH prevents currency/ownership changes even for direct service callers", async () => {
    const f = await financeFixture();
    const old = await createExpense(f.db, f.userId, f.projectId, { amount: "100", currency: "CNY", occurred_at: OCCURRED_AT });
    for (const field of ["currency", "reporting_currency", "user_id", "project_id", "id", "created_at"]) {
      await expect(updateExpense(f.db, f.userId, f.projectId, old.id, { amount: "200", [field]: "USD" })).rejects.toThrow();
    }
    expect(await getExpense(f.db, f.userId, f.projectId, old.id)).toEqual(old);
  });
  it("checks Project ownership before any create/list/summary/item mutation", async () => {
    const f = await financeFixture();
    const other = await financeFixture();
    const body = { amount: "1", currency: "CNY", occurred_at: OCCURRED_AT };
    const old = await createExpense(f.db, f.userId, f.projectId, body);
    const calls = [
      () => createExpense(f.db, other.userId, f.projectId, body),
      () => listExpenses(f.db, other.userId, f.projectId, {}),
      () => summarizeExpenses(f.db, other.userId, f.projectId, {}),
      () => getExpense(f.db, other.userId, f.projectId, old.id),
      () => updateExpense(f.db, other.userId, f.projectId, old.id, { amount: "2" }),
      () => deleteExpense(f.db, other.userId, f.projectId, old.id),
    ];
    for (const call of calls) await expect(call()).rejects.toMatchObject({ code: "PROJECT_NOT_FOUND" });
    await expect(getExpense(f.db, other.userId, other.projectId, old.id)).rejects.toMatchObject({ code: "EXPENSE_NOT_FOUND" });
    expect(await getExpense(f.db, f.userId, f.projectId, old.id)).toEqual(old);
  });
  it("changing currency requires delete/create; deletion only removes Expense", async () => {
    const f = await financeFixture();
    await seedRate();
    const old = await createExpense(f.db, f.userId, f.projectId, { amount: "1", currency: "CNY", occurred_at: OCCURRED_AT });
    await deleteExpense(f.db, f.userId, f.projectId, old.id);
    await expect(getExpense(f.db, f.userId, f.projectId, old.id)).rejects.toMatchObject({ code: "EXPENSE_NOT_FOUND" });
    await expect(deleteExpense(f.db, f.userId, f.projectId, old.id)).rejects.toMatchObject({ code: "EXPENSE_NOT_FOUND" });
    expect(await getFinanceSettings(f.db, f.userId)).toMatchObject({ reportingCurrency: "CNY" });
    expect(await f.db.select().from(exchangeRates).where(eq(exchangeRates.baseCurrency, "USD"))).toHaveLength(1);
    const replacement = await createExpense(f.db, f.userId, f.projectId, { amount: "1", currency: "USD", occurred_at: OCCURRED_AT });
    expect(replacement.id).not.toBe(old.id);
    expect(replacement.currency).toBe("USD");
  });
});

describe("Project expense summary", () => {
  it("groups original amounts and frozen reporting currencies; cache changes cannot alter history", async () => {
    const f = await financeFixture();
    await seedRate();
    await createExpense(f.db, f.userId, f.projectId, { amount: "100", currency: "USD", occurred_at: OCCURRED_AT });
    await createExpense(f.db, f.userId, f.projectId, { amount: "100", currency: "CNY", occurred_at: OCCURRED_AT });
    const before = await summarizeExpenses(f.db, f.userId, f.projectId, {});
    expect(before).toEqual({ count: 2, originalTotals: [{ currency: "CNY", amount: "100.00" }, { currency: "USD", amount: "100.00" }], reportingTotals: [{ currency: "CNY", amount: "812.00" }] });
    await seedRate("USD", "CNY", "9");
    expect(await summarizeExpenses(f.db, f.userId, f.projectId, {})).toEqual(before);
    await putFinanceSettings(f.db, f.userId, { reporting_currency: "USD" });
    await createExpense(f.db, f.userId, f.projectId, { amount: "2", currency: "USD", occurred_at: OCCURRED_AT });
    expect(await summarizeExpenses(f.db, f.userId, f.projectId, {})).toMatchObject({ count: 3,
      reportingTotals: [{ currency: "CNY", amount: "812.00" }, { currency: "USD", amount: "2.00" }] });
  });
  it("sums rounded per-expense values, including JPY/KWD and half-cent ties", async () => {
    const f = await financeFixture();
    for (let i = 0; i < 2; i += 1) await createExpense(f.db, f.userId, f.projectId, { amount: "0.01", currency: "USD", exchange_rate: "1.5", occurred_at: OCCURRED_AT });
    await createExpense(f.db, f.userId, f.projectId, { amount: "100", currency: "JPY", exchange_rate: "0.05", occurred_at: OCCURRED_AT });
    await createExpense(f.db, f.userId, f.projectId, { amount: "1.234", currency: "KWD", exchange_rate: "1", occurred_at: OCCURRED_AT });
    expect(await summarizeExpenses(f.db, f.userId, f.projectId, {})).toEqual({ count: 4,
      originalTotals: [{ currency: "JPY", amount: "100" }, { currency: "KWD", amount: "1.234" }, { currency: "USD", amount: "0.02" }],
      reportingTotals: [{ currency: "CNY", amount: "6.27" }] });
  });
  it("totals may exceed JS safe integer range without precision loss", async () => {
    const f = await financeFixture("USD");
    for (let i = 0; i < 2; i += 1) await createExpense(f.db, f.userId, f.projectId, { amount: "90071992547409.91", currency: "USD", occurred_at: OCCURRED_AT });
    expect(await summarizeExpenses(f.db, f.userId, f.projectId, {})).toEqual({ count: 2,
      originalTotals: [{ currency: "USD", amount: "180143985094819.82" }], reportingTotals: [{ currency: "USD", amount: "180143985094819.82" }] });
  });
  it("filters occurred_at inclusively and category exactly; lists descend and normalize currency", async () => {
    const f = await financeFixture();
    const base = { amount: "1", currency: "CNY", category: "ads" };
    const early = await createExpense(f.db, f.userId, f.projectId, { ...base, occurred_at: "2026-09-01T00:00:00Z" });
    const late = await createExpense(f.db, f.userId, f.projectId, { ...base, occurred_at: "2026-09-30T23:00:00Z" });
    await createExpense(f.db, f.userId, f.projectId, { ...base, category: "hosting", occurred_at: "2026-09-15T00:00:00Z" });
    const query = { from: "2026-09-01T00:00:00Z", to: "2026-09-30T23:00:00Z", category: "ads" };
    expect((await listExpenses(f.db, f.userId, f.projectId, { ...query, currency: "cny" })).map((row) => row.id)).toEqual([late.id, early.id]);
    expect(await summarizeExpenses(f.db, f.userId, f.projectId, query)).toMatchObject({ count: 2, reportingTotals: [{ currency: "CNY", amount: "2.00" }] });
    expect(await summarizeExpenses(f.db, f.userId, f.projectId, { from: query.from, to: query.from })).toMatchObject({ count: 1 });
    expect(await summarizeExpenses(f.db, f.userId, f.projectId, { category: "ADS" })).toEqual({ count: 0, originalTotals: [], reportingTotals: [] });
    await expect(summarizeExpenses(f.db, f.userId, f.projectId, { from: query.to, to: query.from })).rejects.toThrow();
  });
});
