import { z } from "zod";
import { normalizeCurrency } from "../lib/finance-money";
import type { ExchangeRateProvider, ProviderExchangeRate } from "./exchange-rate-provider";

export const FRANKFURTER_BASE_URL = "https://api.frankfurter.dev/v2";
const providerDateSchema = z.iso.date();
const providerResponseSchema = z.array(z.object({
  base: z.string().length(3).regex(/^[A-Z]{3}$/),
  quote: z.string().length(3).regex(/^[A-Z]{3}$/),
  rate: z.number().finite().positive(),
  date: providerDateSchema,
})).min(1);

/** Official v2 /rates response checked at https://frankfurter.dev/ on 2026-09-22.
 * JSON array of { date, base, quote, rate }; HTTP errors have { message }.
 * Error bodies are deliberately not logged or propagated to Expense callers.
 */
export class FrankfurterExchangeRateProvider implements ExchangeRateProvider {
  constructor(private readonly request: typeof fetch = fetch) {}

  async getLatestRates(baseCurrency: string): Promise<ProviderExchangeRate[]> {
    const base = normalizeCurrency(baseCurrency);
    const response = await this.request(`${FRANKFURTER_BASE_URL}/rates?base=${base}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error("FX provider HTTP failure");
    const rows = providerResponseSchema.parse(await response.json());
    const quotes = new Set<string>();
    return rows.map((row) => {
      if (row.base !== base || row.quote === base || quotes.has(row.quote)) throw new Error("Invalid FX provider pair");
      quotes.add(row.quote);
      return {
        baseCurrency: row.base,
        quoteCurrency: row.quote,
        // JSON numbers become decimal immediately; inversion uses BigInt, never 1 / rate.
        rate: String(row.rate),
        rateDate: row.date,
      };
    });
  }
}
