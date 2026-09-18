import { defineConfig } from "drizzle-kit";

// 保留 schema/out 配置供 Drizzle 工具读取；当前 migration 历史由已应用的
// 0000_init.sql 与兼容迁移 0001_users_contract.sql 管理。项目不暴露 generate
// 命令，避免在缺少既有 meta journal 时生成第二份初始建表 migration。
// 远程 push/migrate 需要真实的 Cloudflare 凭据与 D1 Database ID，Phase 1 未配置，
// 因此这里不写入任何 dbCredentials，也不虚构 Account ID / Database ID。
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
});
