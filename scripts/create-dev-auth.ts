import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { generateRawToken, hashToken } from "../src/lib/token";
import { nowEpochMs } from "../src/lib/time";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATABASE_NAME = "iris-api-db";
const DEFAULT_NAME = "Iris Dev User";
const DEFAULT_TIMEZONE = "Asia/Shanghai";
const DEFAULT_LOCALE = "zh-CN";
const DEFAULT_CURRENCY = "CNY";

/** 只做最小转义，避免把未处理的引号拼进 SQL 字面量。 */
function escapeSqlLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

function runWrangler(args: string[]): void {
  const wranglerBin = join(PROJECT_ROOT, "node_modules", ".bin", "wrangler");
  execFileSync(wranglerBin, args, { cwd: PROJECT_ROOT, stdio: "inherit" });
}

async function main(): Promise<void> {
  const name = process.argv[2] ?? DEFAULT_NAME;

  const userId = crypto.randomUUID();
  const tokenId = crypto.randomUUID();
  const rawToken = generateRawToken();
  const tokenHash = await hashToken(rawToken);
  const now = nowEpochMs();

  const sql = [
    "INSERT INTO users (id, name, timezone, locale, default_currency, created_at, updated_at)",
    `VALUES ('${escapeSqlLiteral(userId)}', '${escapeSqlLiteral(name)}', '${DEFAULT_TIMEZONE}', '${DEFAULT_LOCALE}', '${DEFAULT_CURRENCY}', ${now}, ${now});`,
    "INSERT INTO api_tokens (id, user_id, token_hash, name, created_at, expires_at, revoked_at, last_used_at)",
    `VALUES ('${escapeSqlLiteral(tokenId)}', '${escapeSqlLiteral(userId)}', '${escapeSqlLiteral(tokenHash)}', 'dev', ${now}, NULL, NULL, NULL);`,
  ].join("\n");

  const tempDir = mkdtempSync(join(tmpdir(), "iris-dev-auth-"));
  const sqlFile = join(tempDir, "seed.sql");

  try {
    // 原始 Token 绝不落盘：写入临时文件的只有 SHA-256 摘要。
    writeFileSync(sqlFile, sql, "utf8");
    runWrangler(["d1", "execute", DATABASE_NAME, "--local", `--file=${sqlFile}`]);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }

  // 原始 Token 只在成功写入本地 D1 之后打印这一次。
  process.stdout.write(
    [
      "",
      "开发身份已写入本地 D1。",
      "",
      "以下原始 Token 只显示这一次，请立即保存。数据库中只保存它的 SHA-256 摘要：",
      "",
      `  ${rawToken}`,
      "",
      `  用户 ID : ${userId}`,
      `  Token ID: ${tokenId}`,
      `  用户名  : ${name}`,
      `  时区    : ${DEFAULT_TIMEZONE}`,
      `  Locale : ${DEFAULT_LOCALE}`,
      `  货币    : ${DEFAULT_CURRENCY}`,
      "",
      "验证方式（把 <TOKEN> 换成上面那串，注意本脚本不会再次输出它）：",
      "  curl -H 'Authorization: Bearer <TOKEN>' http://127.0.0.1:8787/api/v1/test",
      "",
    ].join("\n"),
  );
}

await main();
