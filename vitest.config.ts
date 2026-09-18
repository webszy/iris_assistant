import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const projectRoot = dirname(fileURLToPath(import.meta.url));

// 测试环境使用真实 D1 binding：把 drizzle/*.sql 作为 D1 migrations 注入，
// 由 tests/apply-migrations.ts 通过 applyD1Migrations 应用到测试数据库。
export default defineConfig(async () => {
  const migrations = await readD1Migrations(join(projectRoot, "drizzle"));

  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: join(projectRoot, "wrangler.jsonc") },
        miniflare: { bindings: { TEST_MIGRATIONS: migrations } },
      }),
    ],
    test: {
      setupFiles: [join(projectRoot, "tests/apply-migrations.ts")],
    },
  };
});
