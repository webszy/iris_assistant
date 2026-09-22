import { createApp } from "./app";
import { runReminderScheduler } from "./services/reminder-scheduler";
import { reminderNotificationAcceptance } from "./services/notification-acceptance";
import { runNotificationDispatcher } from "./services/notification-dispatcher";
import { productionNotificationAdapters } from "./providers/notification-channel";
import { createDb } from "./db";
import { FrankfurterExchangeRateProvider } from "./providers/frankfurter";
import { syncExchangeRates } from "./services/exchange-rates";
import type { Env } from "./types/env";

const app = createApp();

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledController, env: Env): Promise<void> {
    if (event.cron === "* * * * *") {
      const db = createDb(env.DB);
      const adapters = productionNotificationAdapters();
      // Always run delivery recovery even if the reminder scan fails.
      let reminderFailed = false;
      try {
        const reminder = await runReminderScheduler(db, reminderNotificationAcceptance(db, env, adapters));
        reminderFailed = reminder.failed > 0;
      }
      catch { reminderFailed = true; }
      const delivery = await runNotificationDispatcher(db, env, adapters);
      if (reminderFailed || delivery.failed > 0) throw new Error("Notification scheduled processing failed");
      return;
    }
    if (event.cron !== "0 20 * * *") return;
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
