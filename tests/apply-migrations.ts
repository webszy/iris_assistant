import { applyD1Migrations, env } from "cloudflare:test";

// 在真实 D1 binding 上应用 drizzle/*.sql，保证测试使用与生产一致的 schema。
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
