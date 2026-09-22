import { createApp } from "./app";
import { createDb } from "./db";
import { FrankfurterExchangeRateProvider } from "./providers/frankfurter";
import { syncExchangeRates } from "./services/exchange-rates";
import type { Env } from "./types/env";

const app = createApp();

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    let result;
    try {
      result = await syncExchangeRates(createDb(env.DB), new FrankfurterExchangeRateProvider());
    } catch {
      // Even initial settings-read failures must not expose a raw D1/SQL error.
      console.error(JSON.stringify({ provider: "frankfurter", event: "fx_sync_failure",
        reportingCurrency: null, rateCount: 0, rateDates: [], fetchedAt: null, error: "FX_SYNC_INITIALIZATION_FAILED" }));
      throw new Error("FX sync failed before currency processing");
    }
    // All reporting currencies were attempted; expose failure to scheduled invocation metrics.
    if (result.failed > 0) throw new Error("FX sync failed for one or more reporting currencies");
  },
} satisfies ExportedHandler<Env>;
