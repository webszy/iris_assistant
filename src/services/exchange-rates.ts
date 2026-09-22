import { and, asc, eq, sql } from "drizzle-orm";
import type { z } from "zod";
import type { Database } from "../db";
import { exchangeRates, financeSettings } from "../db/schema";
import { formatExchangeRate, invertProviderRate, normalizeCurrency } from "../lib/finance-money";
import { nowEpochMs, toIso8601Utc } from "../lib/time";
import type { ExchangeRateProvider } from "../providers/exchange-rate-provider";
import type { exchangeRateListQuerySchema } from "../schemas/finance";

export async function listExchangeRates(db: Database, query: z.infer<typeof exchangeRateListQuerySchema>) {
  const filters = [];
  if (query.base_currency !== undefined) filters.push(eq(exchangeRates.baseCurrency, normalizeCurrency(query.base_currency)));
  if (query.quote_currency !== undefined) filters.push(eq(exchangeRates.quoteCurrency, normalizeCurrency(query.quote_currency)));
  const rows = await db.select().from(exchangeRates).where(and(...filters)).orderBy(asc(exchangeRates.baseCurrency), asc(exchangeRates.quoteCurrency));
  return rows.map((row) => ({
    baseCurrency: row.baseCurrency, quoteCurrency: row.quoteCurrency,
    rate: formatExchangeRate(row.rateScaled), source: row.source, rateDate: row.rateDate,
    fetchedAt: toIso8601Utc(row.fetchedAt),
  }));
}

/** Per-reporting-currency atomic upsert; validate and normalize ALL rows before any write. */
export async function syncExchangeRates(db: Database, provider: ExchangeRateProvider) {
  const currencies = await db.selectDistinct({ currency: financeSettings.reportingCurrency }).from(financeSettings)
    .orderBy(asc(financeSettings.reportingCurrency));
  const outcome = { succeeded: 0, failed: 0, rateCount: 0 };
  for (const { currency } of currencies) {
    const metadata = { provider: "frankfurter", reportingCurrency: currency };
    console.info(JSON.stringify({ ...metadata, event: "fx_sync_start", rateCount: 0, rateDates: [], fetchedAt: null }));
    let fetchedAt: number | null = null;
    try {
      const rates = await provider.getLatestRates(currency);
      const receivedAt = nowEpochMs();
      fetchedAt = receivedAt;
      if (rates.length === 0) throw new Error("Empty FX response");
      const bases = new Set<string>();
      const rows = rates.map((rate) => {
        const baseCurrency = normalizeCurrency(rate.quoteCurrency);
        if (rate.baseCurrency !== currency || baseCurrency === currency || bases.has(baseCurrency)
          || !/^\d{4}-\d{2}-\d{2}$/.test(rate.rateDate)
          || new Date(`${rate.rateDate}T00:00:00Z`).toISOString().slice(0, 10) !== rate.rateDate) {
          throw new Error("Invalid FX response");
        }
        bases.add(baseCurrency);
        return {
          baseCurrency, quoteCurrency: currency, rateScaled: invertProviderRate(rate.rate), source: "frankfurter",
          rateDate: rate.rateDate, fetchedAt: receivedAt, updatedAt: receivedAt,
        };
      });
      // D1 batch is transactional. One statement per pair also avoids the bind-parameter limit.
      const statements = rows.map((row) => db.insert(exchangeRates).values(row).onConflictDoUpdate({
        target: [exchangeRates.baseCurrency, exchangeRates.quoteCurrency],
        set: {
          rateScaled: row.rateScaled, source: row.source, rateDate: row.rateDate,
          fetchedAt: row.fetchedAt, updatedAt: row.updatedAt,
        },
        // A slower overlapping sync must not replace a newer observation/date.
        setWhere: sql`${exchangeRates.rateDate} <= ${row.rateDate} AND ${exchangeRates.fetchedAt} <= ${row.fetchedAt}`,
      }));
      const first = statements[0];
      if (first === undefined) throw new Error("Empty FX batch");
      await db.batch([first, ...statements.slice(1)]);
      outcome.succeeded += 1;
      outcome.rateCount += rows.length;
      console.info(JSON.stringify({ ...metadata, event: "fx_sync_success", rateCount: rows.length,
        rateDates: [...new Set(rows.map((row) => row.rateDate))].sort(), fetchedAt: toIso8601Utc(fetchedAt) }));
    } catch {
      outcome.failed += 1;
      // Fixed operational metadata only: no provider body, financial payload or SQL error.
      console.error(JSON.stringify({ ...metadata, event: "fx_sync_failure", rateCount: 0, rateDates: [],
        fetchedAt: fetchedAt === null ? null : toIso8601Utc(fetchedAt), error: "FX_SYNC_FAILED" }));
    }
  }
  return outcome;
}
