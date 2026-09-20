import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

import { nowEpochMs } from "../src/lib/time";
import { generateRawToken, hashToken } from "../src/lib/token";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_TIMEZONE = "Asia/Shanghai";
const DEFAULT_LOCALE = "zh-CN";
const DEFAULT_CURRENCY = "CNY";

function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function runWrangler(args: string[]): string {
  return execFileSync(join(PROJECT_ROOT, "node_modules", ".bin", "wrangler"), args, {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function parseWranglerResponse(output: string, failureMessage: string): unknown[] {
  let response: unknown;
  try {
    response = JSON.parse(output);
  } catch {
    throw new Error(failureMessage);
  }
  if (!Array.isArray(response) || response.length === 0 ||
      response.some((item: unknown) =>
        typeof item !== "object" || item === null || !("success" in item) || item.success !== true)) {
    throw new Error(failureMessage);
  }
  return response;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      "user-name": { type: "string" },
      "token-name": { type: "string", default: "personal-production" },
      "expires-days": { type: "string", default: "90" },
      help: { type: "boolean", short: "h" },
    },
    strict: true,
    allowPositionals: false,
  });

  if (values.help) {
    process.stdout.write(
      "用法：npm run auth:create-remote -- --user-name <用户名> " +
      "[--token-name personal-production] [--expires-days 90]\n" +
      "向 wrangler.jsonc 中 DB 绑定的远程 D1 创建新用户，再为该用户创建 Token。\n" +
      "有效期为 1–365 天，默认 90 天；每次执行都会创建一组新的用户和 Token。\n",
    );
    return;
  }

  const userName = values["user-name"]?.trim();
  const tokenName = values["token-name"].trim();
  const daysText = values["expires-days"];
  const days = Number(daysText);
  if (!userName || userName.length > 100 || /[\x00-\x1f\x7f]/.test(userName)) {
    throw new Error("请通过 --user-name 指定 1–100 个字符且不含控制字符的用户名。");
  }
  if (!tokenName || tokenName.length > 100 || /[\x00-\x1f\x7f]/.test(tokenName)) {
    throw new Error("--token-name 必须为 1–100 个字符，且不能包含控制字符。");
  }
  if (!/^\d+$/.test(daysText) || !Number.isInteger(days) || days < 1 || days > 365) {
    throw new Error("--expires-days 必须为 1–365 的整数。");
  }

  const userId = crypto.randomUUID();
  const tokenId = crypto.randomUUID();
  const rawToken = generateRawToken();
  const tokenHash = await hashToken(rawToken);
  const now = nowEpochMs();
  const expiresAt = now + days * 86_400_000;
  const sql = [
    "INSERT INTO users (id, name, timezone, locale, default_currency, created_at, updated_at)",
    `VALUES (${sqlLiteral(userId)}, ${sqlLiteral(userName)}, ${sqlLiteral(DEFAULT_TIMEZONE)}, ` +
      `${sqlLiteral(DEFAULT_LOCALE)}, ${sqlLiteral(DEFAULT_CURRENCY)}, ${now}, ${now});`,
    "INSERT INTO api_tokens (id, user_id, token_hash, name, created_at, expires_at, revoked_at, last_used_at)",
    `VALUES (${sqlLiteral(tokenId)}, ${sqlLiteral(userId)}, ${sqlLiteral(tokenHash)}, ` +
      `${sqlLiteral(tokenName)}, ${now}, ${expiresAt}, NULL, NULL);`,
  ].join("\n");

  const tempDir = mkdtempSync(join(tmpdir(), "iris-remote-auth-"));
  const sqlFile = join(tempDir, "auth.sql");
  process.stderr.write(
    `目标：DB 绑定的远程 D1；用户 ID：${userId}；Token ID：${tokenId}\n`,
  );
  try {
    // 临时 SQL 仅包含 Token 的 SHA-256 摘要，不包含原始 Token。
    writeFileSync(sqlFile, sql, { encoding: "utf8", mode: 0o600 });
    let output: string;
    try {
      output = runWrangler([
        "d1", "execute", "DB", "--remote", "--config", join(PROJECT_ROOT, "wrangler.jsonc"),
        "--file", sqlFile, "--json",
      ]);
    } catch {
      throw new Error(
        "远程写入未确认成功。请检查 Wrangler 登录、D1 绑定及迁移状态；" +
        `写入结果可能未知，请先按用户 ID ${userId} 和 Token ID ${tokenId} 核查后再重试。`,
      );
    }
    parseWranglerResponse(
      output,
      `Wrangler 未返回预期的写入结果。请按用户 ID ${userId} 和 Token ID ${tokenId} 核查远程记录。`,
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }

  const verifySql = [
    "SELECT users.id AS user_id, api_tokens.id AS token_id",
    "FROM users JOIN api_tokens ON api_tokens.user_id = users.id",
    `WHERE users.id = ${sqlLiteral(userId)} AND api_tokens.id = ${sqlLiteral(tokenId)};`,
  ].join("\n");
  let verifyOutput: string;
  try {
    verifyOutput = runWrangler([
      "d1", "execute", "DB", "--remote", "--config", join(PROJECT_ROOT, "wrangler.jsonc"),
      "--command", verifySql, "--json",
    ]);
  } catch {
    throw new Error(
      `远程核验失败。用户 ID ${userId} 和 Token ID ${tokenId} 可能已创建，` +
      "为避免泄露未确认可用的凭据，本次不显示原始 Token。",
    );
  }
  const verifyResponse = parseWranglerResponse(
    verifyOutput,
    `无法确认远程记录。请按用户 ID ${userId} 和 Token ID ${tokenId} 核查；本次不显示原始 Token。`,
  );
  const firstResult = verifyResponse[0];
  const rows = typeof firstResult === "object" && firstResult !== null && "results" in firstResult &&
      Array.isArray(firstResult.results) ? firstResult.results : [];
  if (rows.length !== 1 || rows[0]?.user_id !== userId || rows[0]?.token_id !== tokenId) {
    throw new Error(
      `远程记录核验不匹配。请按用户 ID ${userId} 和 Token ID ${tokenId} 核查；本次不显示原始 Token。`,
    );
  }

  process.stdout.write([
    "",
    "线上用户和 Token 已创建。原始 Token 仅在本次成功后显示，请立即保存到密码管理器：",
    "",
    rawToken,
    "",
    `用户 ID：${userId}`,
    `用户名：${userName}`,
    `Token ID：${tokenId}`,
    `Token 名称：${tokenName}`,
    `到期时间：${new Date(expiresAt).toISOString()}`,
    "",
    "撤销 Token 时，在同一远程 D1 执行以下 SQL（时间单位为毫秒）：",
    `UPDATE api_tokens SET revoked_at = unixepoch() * 1000 WHERE id = ${sqlLiteral(tokenId)};`,
    "",
  ].join("\n"));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "创建失败。");
  process.exitCode = 1;
});
