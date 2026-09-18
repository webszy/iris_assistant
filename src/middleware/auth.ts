import { eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";

import { createDb } from "../db";
import { apiTokens, users } from "../db/schema";
import { ERROR_CODES, errorResponse } from "../lib/response";
import { nowEpochMs, toIso8601Utc } from "../lib/time";
import { hashToken, isWellFormedToken } from "../lib/token";
import type { AppEnv } from "../types/env";

const BEARER_PREFIX = "bearer ";

/**
 * 所有认证失败共用同一文案，避免通过响应差异探测 Token 是否存在、是否被撤销。
 * 文案中不含原始 Token、Authorization 头内容或任何内部细节。
 */
const UNAUTHORIZED_MESSAGE = "认证失败：请提供有效的访问令牌。";

/**
 * Bearer Token 认证中间件。
 * 身份只能来自 Token 关联的 users 记录；绝不读取客户端传入的 user_id。
 */
export const requireBearerAuth = createMiddleware<AppEnv>(async (c, next) => {
  const authorization = c.req.header("Authorization");
  const unauthorized = () => {
    c.header("WWW-Authenticate", "Bearer");
    return c.json(errorResponse(ERROR_CODES.UNAUTHORIZED, UNAUTHORIZED_MESSAGE), 401);
  };

  if (authorization === undefined || authorization.length === 0) {
    return unauthorized();
  }

  if (authorization.slice(0, BEARER_PREFIX.length).toLowerCase() !== BEARER_PREFIX) {
    return unauthorized();
  }

  const rawToken = authorization.slice(BEARER_PREFIX.length).trim();
  if (!isWellFormedToken(rawToken)) {
    return unauthorized();
  }

  const db = createDb(c.env.DB);
  const tokenHash = await hashToken(rawToken);

  const tokenRows = await db
    .select()
    .from(apiTokens)
    .where(eq(apiTokens.tokenHash, tokenHash))
    .limit(1);
  const token = tokenRows[0];

  if (token === undefined) {
    return unauthorized();
  }

  const now = nowEpochMs();

  if (token.revokedAt !== null) {
    return unauthorized();
  }

  if (token.expiresAt !== null && token.expiresAt <= now) {
    return unauthorized();
  }

  const userRows = await db.select().from(users).where(eq(users.id, token.userId)).limit(1);
  const user = userRows[0];

  if (user === undefined) {
    return unauthorized();
  }

  await db.update(apiTokens).set({ lastUsedAt: now }).where(eq(apiTokens.id, token.id));

  c.set("user", {
    id: user.id,
    name: user.name,
    timezone: user.timezone,
    locale: user.locale,
    defaultCurrency: user.defaultCurrency,
    createdAt: toIso8601Utc(user.createdAt),
    updatedAt: toIso8601Utc(user.updatedAt),
  });
  c.set("apiTokenId", token.id);

  await next();
});
