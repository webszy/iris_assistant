import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import { getFinanceSettings, putFinanceSettings, listExchangeRates } from "../controllers/finance";
import { financeValidationHook } from "../lib/finance-validation";
import { errorResponseSchema } from "../lib/response";
import { exchangeRateListQuerySchema, exchangeRateListResponseSchema, financeSettingsItemResponseSchema, putFinanceSettingsRequestSchema } from "../schemas/finance";
import type { AppEnv } from "../types/env";

const errorContent = { "application/json": { schema: errorResponseSchema } };
const errors = {
  400: { content: errorContent, description: "BAD_REQUEST / INVALID_CURRENCY：请求校验失败。" },
  401: { content: errorContent, description: "UNAUTHORIZED：缺少或无效的访问令牌。" },
  422: { content: errorContent, description: "FINANCE_SETTINGS_REQUIRED / INVALID_CURRENCY。" },
};

export const getFinanceSettingsRoute = createRoute({
  method: "get", path: "/api/v1/finance/settings", tags: ["Finance"], summary: "读取用户财务设置",
  description: "设置缺失返回 422 FINANCE_SETTINGS_REQUIRED，不使用 users.default_currency。",
  security: [{ bearerAuth: [] }],
  responses: { 200: { content: { "application/json": { schema: financeSettingsItemResponseSchema } }, description: "查询成功" }, ...errors },
});
export const putFinanceSettingsRoute = createRoute({
  method: "put", path: "/api/v1/finance/settings", tags: ["Finance"], summary: "创建或更新用户财务设置",
  description: "reporting_currency 统一大写；仅影响未来 Expense，不修改历史记录。",
  security: [{ bearerAuth: [] }],
  request: { body: { required: true, content: { "application/json": { schema: putFinanceSettingsRequestSchema } } } },
  responses: { 200: { content: { "application/json": { schema: financeSettingsItemResponseSchema } }, description: "保存成功" }, ...errors },
});
export const listExchangeRatesRoute = createRoute({
  method: "get", path: "/api/v1/finance/exchange-rates", tags: ["Finance"], summary: "查询当前汇率缓存",
  description: "只读、全局共享缓存。1 baseCurrency = rate quoteCurrency；rate 是 8 位小数字符串。任意过滤组合均返回列表，缺失 pair 返回空列表。",
  security: [{ bearerAuth: [] }], request: { query: exchangeRateListQuerySchema },
  responses: { 200: { content: { "application/json": { schema: exchangeRateListResponseSchema } }, description: "查询成功" }, ...errors },
});

export function registerFinanceRoutes(app: OpenAPIHono<AppEnv>): void {
  app.openapi(getFinanceSettingsRoute, getFinanceSettings, financeValidationHook);
  app.openapi(putFinanceSettingsRoute, putFinanceSettings, financeValidationHook);
  app.openapi(listExchangeRatesRoute, listExchangeRates, financeValidationHook);
}
