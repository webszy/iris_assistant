import { eq } from "drizzle-orm";
import type { Database } from "../db";
import { financeSettings, type FinanceSettingsRow } from "../db/schema";
import { ERROR_CODES } from "../lib/error-codes";
import { normalizeCurrency } from "../lib/finance-money";
import { ServiceError } from "../lib/service-error";
import { nowEpochMs, toIso8601Utc } from "../lib/time";

export async function requireFinanceSettings(db: Database, userId: string): Promise<FinanceSettingsRow> {
  const [row] = await db.select().from(financeSettings).where(eq(financeSettings.userId, userId)).limit(1);
  if (row === undefined) throw new ServiceError(ERROR_CODES.FINANCE_SETTINGS_REQUIRED, "请先设置 reporting_currency。");
  return row;
}

function toSettingsResponse(row: FinanceSettingsRow) {
  return { reportingCurrency: row.reportingCurrency, createdAt: toIso8601Utc(row.createdAt), updatedAt: toIso8601Utc(row.updatedAt) };
}

export async function getFinanceSettings(db: Database, userId: string) {
  return toSettingsResponse(await requireFinanceSettings(db, userId));
}

export async function putFinanceSettings(db: Database, userId: string, body: { reporting_currency: string }) {
  const reportingCurrency = normalizeCurrency(body.reporting_currency);
  const now = nowEpochMs();
  const [row] = await db.insert(financeSettings).values({ userId, reportingCurrency, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: financeSettings.userId, set: { reportingCurrency, updatedAt: now } }).returning();
  if (row === undefined) throw new Error("Finance settings missing after upsert");
  return toSettingsResponse(row);
}
