import type { RouteHandler } from "@hono/zod-openapi";

import { nowEpochMs, toIso8601Utc } from "../lib/time";
import type { testRoute } from "../routes/test";
import type { AppEnv } from "../types/env";

export const getAuthenticatedTest: RouteHandler<typeof testRoute, AppEnv> = (c) =>
  c.json(
    {
      success: true,
      data: {
        message: "认证通过",
        user: c.get("user"),
        tokenId: c.get("apiTokenId"),
        requestedAt: toIso8601Utc(nowEpochMs()),
      },
    },
    200,
  );
