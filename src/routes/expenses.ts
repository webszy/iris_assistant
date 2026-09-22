import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import { createExpense, deleteExpense, getExpense, listExpenses, summarizeExpenses, updateExpense } from "../controllers/expenses";
import { financeValidationHook } from "../lib/finance-validation";
import { errorResponseSchema } from "../lib/response";
import { createExpenseRequestSchema, expenseItemResponseSchema, expenseListQuerySchema, expenseListResponseSchema,
  expenseParamsSchema, expenseProjectParamsSchema, expenseSummaryQuerySchema, expenseSummaryResponseSchema, updateExpenseRequestSchema } from "../schemas/finance";
import type { AppEnv } from "../types/env";

const errorContent = { "application/json": { schema: errorResponseSchema } };
const errors = {
  400: { content: errorContent, description: "BAD_REQUEST / INVALID_CURRENCY / INVALID_MONEY_AMOUNT / INVALID_EXCHANGE_RATE：请求校验失败。" },
  401: { content: errorContent, description: "UNAUTHORIZED：缺少或无效的访问令牌。" },
  404: { content: errorContent, description: "PROJECT_NOT_FOUND / EXPENSE_NOT_FOUND：不存在或不属于当前用户与 URL Project。" },
  422: { content: errorContent, description: "FINANCE_SETTINGS_REQUIRED / EXCHANGE_RATE_NOT_FOUND / INVALID_MONEY_AMOUNT / INVALID_CURRENCY / INVALID_EXCHANGE_RATE。" },
};
const itemContent = { "application/json": { schema: expenseItemResponseSchema } };

export const listExpensesRoute = createRoute({
  method: "get", path: "/api/v1/projects/{projectId}/expenses", tags: ["Expense"], summary: "列出 Project 支出",
  description: "按 occurred_at DESC 返回，无分页。from/to 为带时区 ISO 时间，双端包含；currency 大写归一化，category 去除首尾空白后精确匹配。",
  security: [{ bearerAuth: [] }], request: { params: expenseProjectParamsSchema, query: expenseListQuerySchema },
  responses: { 200: { content: { "application/json": { schema: expenseListResponseSchema } }, description: "查询成功" }, ...errors },
});
export const createExpenseRoute = createRoute({
  method: "post", path: "/api/v1/projects/{projectId}/expenses", tags: ["Expense"], summary: "记录 Project 支出",
  description: "occurred_at 必填。必须显式配置 FinanceSettings。汇率优先级：显式值、同币种 1、当前缓存；历史日期也使用当前缓存，不调用历史 FX。金额正数且不得超过币种精度。逐笔 reportingAmount 四舍五入到 reporting currency 最小单位。",
  security: [{ bearerAuth: [] }], request: { params: expenseProjectParamsSchema,
    body: { required: true, content: { "application/json": { schema: createExpenseRequestSchema } } } },
  responses: { 201: { content: itemContent, description: "创建成功" }, ...errors },
});
export const expenseSummaryRoute = createRoute({
  method: "get", path: "/api/v1/projects/{projectId}/expenses/summary", tags: ["Expense"], summary: "汇总 Project 支出",
  description: "仅使用 Expense 保存的汇率。originalTotals 按原币种分组；reportingTotals 按历史 reporting currency 分组，累加逐笔四舍五入金额。from/to 双端包含；category 精确匹配。空集合 count=0，两组总额为空数组。",
  security: [{ bearerAuth: [] }], request: { params: expenseProjectParamsSchema, query: expenseSummaryQuerySchema },
  responses: { 200: { content: { "application/json": { schema: expenseSummaryResponseSchema } }, description: "查询成功" }, ...errors },
});
export const getExpenseRoute = createRoute({
  method: "get", path: "/api/v1/projects/{projectId}/expenses/{expenseId}", tags: ["Expense"], summary: "读取一笔支出",
  security: [{ bearerAuth: [] }], request: { params: expenseParamsSchema },
  responses: { 200: { content: itemContent, description: "查询成功" }, ...errors },
});
export const updateExpenseRoute = createRoute({
  method: "patch", path: "/api/v1/projects/{projectId}/expenses/{expenseId}", tags: ["Expense"], summary: "修改一笔支出",
  description: "currency 和 reporting_currency 永久冻结，提交即拒绝；修改币种必须删除重建。可改 amount、exchange_rate、category、description、occurred_at。只在显式提交 exchange_rate 时修改汇率；不查询当前设置或 FX。category/description 可用 null 清空。",
  security: [{ bearerAuth: [] }], request: { params: expenseParamsSchema,
    body: { required: true, content: { "application/json": { schema: updateExpenseRequestSchema } } } },
  responses: { 200: { content: itemContent, description: "更新成功" }, ...errors },
});
export const deleteExpenseRoute = createRoute({
  method: "delete", path: "/api/v1/projects/{projectId}/expenses/{expenseId}", tags: ["Expense"], summary: "永久删除一笔支出",
  description: "只硬删除指定 Expense，不修改 Project、设置或汇率缓存。",
  security: [{ bearerAuth: [] }], request: { params: expenseParamsSchema },
  responses: { 204: { description: "删除成功，无响应体" }, ...errors },
});

export function registerExpenseRoutes(app: OpenAPIHono<AppEnv>): void {
  app.openapi(listExpensesRoute, listExpenses, financeValidationHook);
  app.openapi(createExpenseRoute, createExpense, financeValidationHook);
  app.openapi(expenseSummaryRoute, summarizeExpenses, financeValidationHook);
  app.openapi(getExpenseRoute, getExpense, financeValidationHook);
  app.openapi(updateExpenseRoute, updateExpense, financeValidationHook);
  app.openapi(deleteExpenseRoute, deleteExpense, financeValidationHook);
}
