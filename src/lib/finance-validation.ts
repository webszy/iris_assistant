import type { Context } from "hono";
import type { AppEnv } from "../types/env";
import { ERROR_CODES, errorResponse, type ErrorCode } from "./response";

/** Route-local mapping; v0.1 validation and error semantics stay untouched. */
export function financeValidationHook(
  result: { success: boolean; error?: { issues: readonly { code: string; path: readonly PropertyKey[] }[] } },
  c: Context<AppEnv>,
) {
  if (result.success) return;
  const issues = result.error?.issues ?? [];
  let code: ErrorCode = ERROR_CODES.BAD_REQUEST;
  if (!issues.some((issue) => issue.code === "unrecognized_keys")) {
    const field = issues[0]?.path[0];
    if (["currency", "reporting_currency", "base_currency", "quote_currency"].includes(String(field))) code = ERROR_CODES.INVALID_CURRENCY;
    else if (field === "amount") code = ERROR_CODES.INVALID_MONEY_AMOUNT;
    else if (field === "exchange_rate") code = ERROR_CODES.INVALID_EXCHANGE_RATE;
  }
  return c.json(errorResponse(code, "请求参数校验失败。"), 400);
}
