import type { RouteHandler } from "@hono/zod-openapi";
import { createDb } from "../db";
import type { createExpenseRoute, deleteExpenseRoute, getExpenseRoute, listExpensesRoute, expenseSummaryRoute, updateExpenseRoute } from "../routes/expenses";
import * as service from "../services/expenses";
import type { AppEnv } from "../types/env";

export const listExpenses: RouteHandler<typeof listExpensesRoute, AppEnv> = async (c) => {
  const data = await service.listExpenses(createDb(c.env.DB), c.get("user").id, c.req.valid("param").projectId, c.req.valid("query"));
  return c.json({ success: true as const, data }, 200);
};
export const createExpense: RouteHandler<typeof createExpenseRoute, AppEnv> = async (c) => {
  const data = await service.createExpense(createDb(c.env.DB), c.get("user").id, c.req.valid("param").projectId, c.req.valid("json"));
  return c.json({ success: true as const, data }, 201);
};
export const getExpense: RouteHandler<typeof getExpenseRoute, AppEnv> = async (c) => {
  const { projectId, expenseId } = c.req.valid("param");
  const data = await service.getExpense(createDb(c.env.DB), c.get("user").id, projectId, expenseId);
  return c.json({ success: true as const, data }, 200);
};
export const updateExpense: RouteHandler<typeof updateExpenseRoute, AppEnv> = async (c) => {
  const { projectId, expenseId } = c.req.valid("param");
  const data = await service.updateExpense(createDb(c.env.DB), c.get("user").id, projectId, expenseId, c.req.valid("json"));
  return c.json({ success: true as const, data }, 200);
};
export const deleteExpense: RouteHandler<typeof deleteExpenseRoute, AppEnv> = async (c) => {
  const { projectId, expenseId } = c.req.valid("param");
  await service.deleteExpense(createDb(c.env.DB), c.get("user").id, projectId, expenseId);
  return c.body(null, 204);
};
export const summarizeExpenses: RouteHandler<typeof expenseSummaryRoute, AppEnv> = async (c) => {
  const data = await service.summarizeExpenses(createDb(c.env.DB), c.get("user").id, c.req.valid("param").projectId, c.req.valid("query"));
  return c.json({ success: true as const, data }, 200);
};
