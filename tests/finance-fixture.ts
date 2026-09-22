import { env } from "cloudflare:test";
import { createDb } from "../src/db";
import { exchangeRates } from "../src/db/schema";
import { parseExchangeRate } from "../src/lib/finance-money";
import { putFinanceSettings } from "../src/services/finance-settings";
import { createProject } from "../src/services/projects";
import { seedIdentity } from "./helpers";

export const OCCURRED_AT = "2026-09-22T10:30:00+08:00";

export async function financeFixture(reportingCurrency: string | null = "CNY") {
  const identity = await seedIdentity();
  const db = createDb(env.DB);
  const project = await createProject(db, identity.userId, { name: "Finance", slug: "finance" });
  if (reportingCurrency !== null) await putFinanceSettings(db, identity.userId, { reporting_currency: reportingCurrency });
  return { db, identity, userId: identity.userId, projectId: project.id, basePath: `/api/v1/projects/${project.id}/expenses` };
}

export async function seedRate(base = "USD", quote = "CNY", rate = "7.12") {
  const row = { baseCurrency: base, quoteCurrency: quote, rateScaled: parseExchangeRate(rate),
    source: "frankfurter", rateDate: "2026-09-21", fetchedAt: Date.parse("2026-09-21T20:00:00Z"), updatedAt: Date.parse("2026-09-21T20:00:00Z") };
  await createDb(env.DB).insert(exchangeRates).values(row).onConflictDoUpdate({
    target: [exchangeRates.baseCurrency, exchangeRates.quoteCurrency], set: row,
  });
}
