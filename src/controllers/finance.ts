import type { RouteHandler } from "@hono/zod-openapi";
import { createDb } from "../db";
import type { getFinanceSettingsRoute, putFinanceSettingsRoute, listExchangeRatesRoute } from "../routes/finance";
import * as settings from "../services/finance-settings";
import * as rates from "../services/exchange-rates";
import type { AppEnv } from "../types/env";

export const getFinanceSettings: RouteHandler<typeof getFinanceSettingsRoute, AppEnv> = async (c) => {
  const data = await settings.getFinanceSettings(createDb(c.env.DB), c.get("user").id);
  return c.json({ success: true as const, data }, 200);
};
export const putFinanceSettings: RouteHandler<typeof putFinanceSettingsRoute, AppEnv> = async (c) => {
  const data = await settings.putFinanceSettings(createDb(c.env.DB), c.get("user").id, c.req.valid("json"));
  return c.json({ success: true as const, data }, 200);
};
export const listExchangeRates: RouteHandler<typeof listExchangeRatesRoute, AppEnv> = async (c) => {
  const data = await rates.listExchangeRates(createDb(c.env.DB), c.req.valid("query"));
  return c.json({ success: true as const, data }, 200);
};
