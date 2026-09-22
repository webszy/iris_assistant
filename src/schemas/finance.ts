import { z } from "@hono/zod-openapi";

export const currencyInputSchema = z.string().length(3).regex(/^[A-Za-z]{3}$/)
  .transform((value) => value.toUpperCase()).openapi("FinanceCurrencyInput", { example: "USD" });
const currencyResponseSchema = z.string().length(3).regex(/^[A-Z]{3}$/);
export const moneyInputSchema = z.string().max(32).regex(/^\d+(?:\.\d+)?$/)
  .refine((value) => value === value.trim(), { message: "Money must not contain whitespace" })
  .openapi("MoneyInput", { example: "120.50", description: "Positive decimal string; excess currency precision is rejected. Scaled integer must be <= 9007199254740991." });
export const rateInputSchema = z.string().max(32).regex(/^\d+(?:\.\d{1,8})?$/)
  .refine((value) => value === value.trim(), { message: "Rate must not contain whitespace" })
  .openapi("ExchangeRateInput", { example: "7.1843", description: "Positive decimal string, at most 8 decimals. 1 expense currency = rate reporting currency; scaled value <= 9007199254740991." });
const moneyResponseSchema = z.string().regex(/^\d+(?:\.\d+)?$/);
const rateResponseSchema = z.string().regex(/^\d+\.\d{8}$/);
export const financeTimestampSchema = z.iso.datetime({ offset: true });
const categorySchema = z.string().trim().min(1).max(100);

export const putFinanceSettingsRequestSchema = z.object({ reporting_currency: currencyInputSchema }).strict()
  .openapi("PutFinanceSettingsRequest");
export const financeSettingsResponseSchema = z.object({
  reportingCurrency: currencyResponseSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
}).openapi("FinanceSettings");
export const financeSettingsItemResponseSchema = z.object({ success: z.literal(true), data: financeSettingsResponseSchema })
  .openapi("FinanceSettingsResponse");

export const exchangeRateListQuerySchema = z.object({
  base_currency: currencyInputSchema.optional(),
  quote_currency: currencyInputSchema.optional(),
}).strict().openapi("ExchangeRateListQuery");
export const exchangeRateResponseSchema = z.object({
  baseCurrency: currencyResponseSchema,
  quoteCurrency: currencyResponseSchema,
  rate: rateResponseSchema,
  source: z.string(),
  rateDate: z.string(),
  fetchedAt: z.string(),
}).openapi("ExchangeRate");
export const exchangeRateListResponseSchema = z.object({ success: z.literal(true), data: z.array(exchangeRateResponseSchema) })
  .openapi("ExchangeRateListResponse");

export const createExpenseRequestSchema = z.object({
  amount: moneyInputSchema,
  currency: currencyInputSchema,
  exchange_rate: rateInputSchema.optional(),
  category: categorySchema.nullable().optional(),
  description: z.string().max(4000).nullable().optional(),
  occurred_at: financeTimestampSchema,
}).strict().openapi("CreateExpenseRequest");

// Currency is immutable, even when a PATCH submits the same currency.
// Changing it requires an explicitly authorized DELETE followed by CREATE.
export const updateExpenseRequestSchema = z.object({
  amount: moneyInputSchema.optional(),
  exchange_rate: rateInputSchema.optional(),
  category: categorySchema.nullable().optional(),
  description: z.string().max(4000).nullable().optional(),
  occurred_at: financeTimestampSchema.optional(),
}).strict().openapi("UpdateExpenseRequest");

export const expenseProjectParamsSchema = z.object({ projectId: z.string().min(1) }).openapi("ExpenseProjectParams");
export const expenseParamsSchema = expenseProjectParamsSchema.extend({ expenseId: z.string().min(1) }).openapi("ExpenseParams");
const filterShape = {
  from: financeTimestampSchema.optional(),
  to: financeTimestampSchema.optional(),
  category: categorySchema.optional(),
};
function validRange(query: { from?: string; to?: string }): boolean {
  return query.from === undefined || query.to === undefined || Date.parse(query.from) <= Date.parse(query.to);
}
export const expenseListQuerySchema = z.object({ ...filterShape, currency: currencyInputSchema.optional() }).strict()
  .refine(validRange, { message: "from must not be later than to" }).openapi("ExpenseListQuery");
export const expenseSummaryQuerySchema = z.object(filterShape).strict()
  .refine(validRange, { message: "from must not be later than to" }).openapi("ExpenseSummaryQuery");

export const expenseResponseSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  amount: moneyResponseSchema,
  currency: currencyResponseSchema,
  reportingCurrency: currencyResponseSchema,
  exchangeRate: rateResponseSchema,
  reportingAmount: moneyResponseSchema,
  category: z.string().nullable(),
  description: z.string().nullable(),
  occurredAt: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
}).openapi("Expense");
export const expenseItemResponseSchema = z.object({ success: z.literal(true), data: expenseResponseSchema }).openapi("ExpenseItemResponse");
export const expenseListResponseSchema = z.object({ success: z.literal(true), data: z.array(expenseResponseSchema) }).openapi("ExpenseListResponse");
const totalSchema = z.object({ currency: currencyResponseSchema, amount: moneyResponseSchema });
export const expenseSummaryResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({ count: z.number().int().nonnegative(), originalTotals: z.array(totalSchema), reportingTotals: z.array(totalSchema) }),
}).openapi("ExpenseSummaryResponse");
