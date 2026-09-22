import { and, desc, eq, gte, lte } from "drizzle-orm";
import type { z } from "zod";
import type { Database } from "../db";
import { exchangeRates, expenses, type ExpenseRow } from "../db/schema";
import { ERROR_CODES } from "../lib/error-codes";
import { FX_RATE_SCALE, formatExchangeRate, formatMoneyAmount, normalizeCurrency, parseExchangeRate, parseMoneyAmount, reportingAmountMinor } from "../lib/finance-money";
import { ServiceError } from "../lib/service-error";
import { nowEpochMs, toIso8601Utc } from "../lib/time";
import { createExpenseRequestSchema, expenseListQuerySchema, expenseSummaryQuerySchema, updateExpenseRequestSchema } from "../schemas/finance";
import { requireFinanceSettings } from "./finance-settings";
import { findUserProject } from "./projects";

async function requireProject(db: Database, userId: string, projectId: string) {
  if (await findUserProject(db, userId, projectId) === undefined) {
    throw new ServiceError(ERROR_CODES.PROJECT_NOT_FOUND, "Project 不存在。");
  }
}

function expenseScope(userId: string, projectId: string, expenseId: string) {
  return and(eq(expenses.userId, userId), eq(expenses.projectId, projectId), eq(expenses.id, expenseId));
}

function requireExpense(row: ExpenseRow | undefined): ExpenseRow {
  if (row === undefined) throw new ServiceError(ERROR_CODES.EXPENSE_NOT_FOUND, "Expense 不存在。");
  return row;
}

export function toExpenseResponse(row: ExpenseRow) {
  return {
    id: row.id, projectId: row.projectId,
    amount: formatMoneyAmount(BigInt(row.amountMinor), row.currency), currency: row.currency,
    reportingCurrency: row.reportingCurrency, exchangeRate: formatExchangeRate(row.exchangeRateScaled),
    reportingAmount: formatMoneyAmount(reportingAmountMinor(row.amountMinor, row.currency, row.reportingCurrency, row.exchangeRateScaled), row.reportingCurrency),
    category: row.category, description: row.description,
    occurredAt: toIso8601Utc(row.occurredAt), createdAt: toIso8601Utc(row.createdAt), updatedAt: toIso8601Utc(row.updatedAt),
  };
}

async function resolveCreateRate(db: Database, currency: string, reportingCurrency: string, explicitRate?: string): Promise<number> {
  if (explicitRate !== undefined) return parseExchangeRate(explicitRate);
  if (currency === reportingCurrency) return FX_RATE_SCALE;
  const [rate] = await db.select().from(exchangeRates)
    .where(and(eq(exchangeRates.baseCurrency, currency), eq(exchangeRates.quoteCurrency, reportingCurrency))).limit(1);
  if (rate === undefined) throw new ServiceError(ERROR_CODES.EXCHANGE_RATE_NOT_FOUND, "当前币种对没有可用汇率，请等待同步或提供实际汇率。");
  return rate.rateScaled;
}

export async function createExpense(db: Database, userId: string, projectId: string, body: z.infer<typeof createExpenseRequestSchema>) {
  await requireProject(db, userId, projectId);
  const settings = await requireFinanceSettings(db, userId);
  const input = createExpenseRequestSchema.parse(body);
  const currency = normalizeCurrency(input.currency);
  const amountMinor = parseMoneyAmount(input.amount, currency);
  const exchangeRateScaled = await resolveCreateRate(db, currency, settings.reportingCurrency, input.exchange_rate);
  const now = nowEpochMs();
  const [row] = await db.insert(expenses).values({
    id: crypto.randomUUID(), userId, projectId, amountMinor, currency,
    reportingCurrency: settings.reportingCurrency, exchangeRateScaled,
    category: input.category ?? null, description: input.description ?? null,
    occurredAt: Date.parse(input.occurred_at), createdAt: now, updatedAt: now,
  }).returning();
  return toExpenseResponse(requireExpense(row));
}

export async function getExpense(db: Database, userId: string, projectId: string, expenseId: string) {
  await requireProject(db, userId, projectId);
  const [row] = await db.select().from(expenses).where(expenseScope(userId, projectId, expenseId)).limit(1);
  return toExpenseResponse(requireExpense(row));
}

export async function updateExpense(db: Database, userId: string, projectId: string, expenseId: string, body: z.infer<typeof updateExpenseRequestSchema>) {
  await requireProject(db, userId, projectId);
  const [existing] = await db.select().from(expenses).where(expenseScope(userId, projectId, expenseId)).limit(1);
  const row = requireExpense(existing);
  // Also reject currency/ownership fields for non-HTTP callers before any write.
  const input = updateExpenseRequestSchema.parse(body);
  const patch: Partial<typeof expenses.$inferInsert> = { updatedAt: nowEpochMs() };
  if (input.amount !== undefined) patch.amountMinor = parseMoneyAmount(input.amount, row.currency);
  if (input.exchange_rate !== undefined) patch.exchangeRateScaled = parseExchangeRate(input.exchange_rate);
  if (input.category !== undefined) patch.category = input.category;
  if (input.description !== undefined) patch.description = input.description;
  if (input.occurred_at !== undefined) patch.occurredAt = Date.parse(input.occurred_at);
  // Do not read settings or FX cache, and do not overwrite omitted fields from a stale read.
  const [updated] = await db.update(expenses).set(patch).where(expenseScope(userId, projectId, expenseId)).returning();
  return toExpenseResponse(requireExpense(updated));
}

export async function deleteExpense(db: Database, userId: string, projectId: string, expenseId: string): Promise<void> {
  await requireProject(db, userId, projectId);
  const [deleted] = await db.delete(expenses).where(expenseScope(userId, projectId, expenseId)).returning();
  requireExpense(deleted);
}

function listFilters(userId: string, projectId: string, query: z.infer<typeof expenseListQuerySchema>) {
  const filters = [eq(expenses.userId, userId), eq(expenses.projectId, projectId)];
  if (query.from !== undefined) filters.push(gte(expenses.occurredAt, Date.parse(query.from)));
  if (query.to !== undefined) filters.push(lte(expenses.occurredAt, Date.parse(query.to)));
  if (query.category !== undefined) filters.push(eq(expenses.category, query.category));
  if (query.currency !== undefined) filters.push(eq(expenses.currency, normalizeCurrency(query.currency)));
  return and(...filters);
}

export async function listExpenses(db: Database, userId: string, projectId: string, query: z.infer<typeof expenseListQuerySchema>) {
  await requireProject(db, userId, projectId);
  const input = expenseListQuerySchema.parse(query);
  const rows = await db.select().from(expenses).where(listFilters(userId, projectId, input))
    .orderBy(desc(expenses.occurredAt), desc(expenses.id));
  return rows.map(toExpenseResponse);
}

export async function summarizeExpenses(db: Database, userId: string, projectId: string, query: z.infer<typeof expenseSummaryQuerySchema>) {
  await requireProject(db, userId, projectId);
  const input = expenseSummaryQuerySchema.parse(query);
  const rows = await db.select({
    amountMinor: expenses.amountMinor, currency: expenses.currency,
    reportingCurrency: expenses.reportingCurrency, exchangeRateScaled: expenses.exchangeRateScaled,
  }).from(expenses).where(listFilters(userId, projectId, input));
  const original = new Map<string, bigint>();
  const reporting = new Map<string, bigint>();
  for (const row of rows) {
    original.set(row.currency, (original.get(row.currency) ?? 0n) + BigInt(row.amountMinor));
    const converted = reportingAmountMinor(row.amountMinor, row.currency, row.reportingCurrency, row.exchangeRateScaled);
    reporting.set(row.reportingCurrency, (reporting.get(row.reportingCurrency) ?? 0n) + converted);
  }
  const totals = (values: Map<string, bigint>) => [...values.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, amount]) => ({ currency, amount: formatMoneyAmount(amount, currency) }));
  return { count: rows.length, originalTotals: totals(original), reportingTotals: totals(reporting) };
}
