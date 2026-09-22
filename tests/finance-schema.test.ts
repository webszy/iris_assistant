import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { financeSettings, expenses } from "../src/db/schema";
import { financeFixture, OCCURRED_AT, seedRate } from "./finance-fixture";
import { createExpense } from "../src/services/expenses";

async function columns(table: "finance_settings" | "exchange_rates" | "expenses") {
  return (await env.DB.prepare(`PRAGMA table_info(${table})`).all<{ name: string; type: string; pk: number; notnull: number }>()).results;
}

describe("Finance additive D1 migration", () => {
  it("has exactly the approved columns, explicit settings and a pair key", async () => {
    const settings = await columns("finance_settings");
    expect(settings.map((column) => column.name)).toEqual(["user_id", "reporting_currency", "created_at", "updated_at"]);
    expect(settings.find((column) => column.name === "user_id")?.pk).toBe(1);
    const rates = await columns("exchange_rates");
    expect(rates.map((column) => column.name)).toEqual(["base_currency", "quote_currency", "rate_scaled", "source", "rate_date", "fetched_at", "updated_at"]);
    expect(rates.filter((column) => column.pk > 0).map((column) => column.name)).toEqual(["base_currency", "quote_currency"]);
    const expenseColumns = await columns("expenses");
    expect(expenseColumns.map((column) => column.name)).toEqual([
      "id", "user_id", "project_id", "amount_minor", "currency", "reporting_currency", "exchange_rate_scaled",
      "category", "description", "occurred_at", "created_at", "updated_at",
    ]);
    for (const name of ["amount_minor", "exchange_rate_scaled", "occurred_at", "created_at", "updated_at"]) {
      expect(expenseColumns.find((column) => column.name === name)?.type.toLowerCase()).toBe("integer");
    }
    expect((await env.DB.prepare("PRAGMA foreign_key_list(expenses)").all<{ table: string }>()).results.map((row) => row.table).sort()).toEqual(["projects", "users"]);
    const indexes = (await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='expenses' AND name NOT LIKE 'sqlite_%'").all<{ name: string }>()).results;
    expect(indexes.map((row) => row.name)).toEqual(["expenses_user_id_project_id_occurred_at_idx"]);
  });
  it("requires an explicit reporting currency and enforces one settings row per user", async () => {
    const f = await financeFixture();
    await expect(f.db.insert(financeSettings).values({ userId: f.userId, reportingCurrency: "USD", createdAt: 1, updatedAt: 1 })).rejects.toThrow();
    const other = await financeFixture(null);
    await expect(env.DB.prepare("INSERT INTO finance_settings(user_id, created_at, updated_at) VALUES (?, 1, 1)").bind(other.userId).run()).rejects.toThrow();
    await expect(env.DB.prepare("INSERT INTO finance_settings(user_id, reporting_currency, created_at, updated_at) VALUES (?, 'cny', 1, 1)").bind(other.userId).run()).rejects.toThrow();
  });
  it("stores safe integers, UTC epoch milliseconds and UUID v4 without derived totals", async () => {
    const f = await financeFixture();
    await seedRate();
    const result = await createExpense(f.db, f.userId, f.projectId, { amount: "120.50", currency: "USD", occurred_at: OCCURRED_AT });
    expect(result.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(await env.DB.prepare("SELECT amount_minor, exchange_rate_scaled, occurred_at, typeof(amount_minor) AS storage_type FROM expenses WHERE id=?").bind(result.id).first())
      .toEqual({ amount_minor: 12050, exchange_rate_scaled: 712000000, occurred_at: Date.parse(OCCURRED_AT), storage_type: "integer" });
  });
  it("DB rejects unsafe, nonpositive or non-integer money/rates and missing parents", async () => {
    const f = await financeFixture();
    const base = { userId: f.userId, projectId: f.projectId, amountMinor: 1, currency: "USD", reportingCurrency: "CNY", exchangeRateScaled: 100000000,
      occurredAt: Date.parse(OCCURRED_AT), createdAt: Date.now(), updatedAt: Date.now() };
    for (const amountMinor of [0, -1, 1.5, 9007199254740992]) {
      await expect(f.db.insert(expenses).values({ ...base, id: crypto.randomUUID(), amountMinor })).rejects.toThrow();
    }
    for (const exchangeRateScaled of [0, -1, 1.5, 9007199254740992]) {
      await expect(f.db.insert(expenses).values({ ...base, id: crypto.randomUUID(), exchangeRateScaled })).rejects.toThrow();
    }
    await expect(f.db.insert(expenses).values({ ...base, id: crypto.randomUUID(), projectId: "missing" })).rejects.toThrow();
    await expect(f.db.insert(expenses).values({ ...base, id: crypto.randomUUID(), userId: "missing" })).rejects.toThrow();
  });
});
