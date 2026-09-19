import type { RouteHandler } from "@hono/zod-openapi";

import { nowEpochMs, toIso8601Utc } from "../lib/time";
import type { healthRoute } from "../routes/health";
import type { AppEnv } from "../types/env";

export const getHealth: RouteHandler<typeof healthRoute, AppEnv> = (c) =>
  c.json(
    {
      success: true,
      data: {
        status: "ok",
        service: "iris-api",
        timestamp: toIso8601Utc(nowEpochMs()),
      },
    },
    200,
  );
