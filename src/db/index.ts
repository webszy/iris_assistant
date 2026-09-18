import { drizzle } from "drizzle-orm/d1";

import * as schema from "./schema";

/** 用当前请求的 D1 binding 构造 Drizzle 客户端。 */
export function createDb(d1: D1Database) {
  return drizzle(d1, { schema });
}

export type Database = ReturnType<typeof createDb>;

export { schema };
