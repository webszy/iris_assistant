import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

import { nowEpochMs } from "../src/lib/time";
import { generateRawToken, hashToken } from "../src/lib/token";
import { parseWranglerResponse } from "./lib/wrangler-response";

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

async function askApiUrl(): Promise<string> {
  if (!process.stdin.isTTY) {
    throw new Error("请在交互式终端中运行并输入 API URL；未生成 Token，也未创建远程用户。");
  }
  const input = createInterface({ input: process.stdin, output: process.stderr });
  const abort = new AbortController();
  input.once("close", () => abort.abort());
  let answer: string;
  try {
    answer = (await input.question("请输入 Iris API URL（必填）：", { signal: abort.signal })).trim();
  } catch {
    throw new Error("未提供 API URL，已取消；未生成 Token，也未创建远程用户。");
  } finally {
    input.close();
  }
  try {
    if (!answer || /\s/.test(answer)) throw new Error();
    const url = new URL(answer);
    if (!/^https?:\/\//i.test(answer) || !["https:", "http:"].includes(url.protocol) ||
        !url.hostname || url.username || url.password || url.search || url.hash) {
      throw new Error();
    }
    return url.href.replace(/\/+$/, "");
  } catch {
    throw new Error("API URL 必须是有效的 HTTP(S) 基础地址，且不含凭据、查询参数或片段；未生成 Token，也未创建远程用户。");
  }
}

function saveConfig(apiUrl: string, rawToken: string): void {
  const configDir = join(homedir(), ".iris");
  const configFile = join(configDir, "config.env");
  mkdirSync(configDir, { recursive: true, mode: 0o700 });
  chmodSync(configDir, 0o700);
  let content = "";
  try {
    content = readFileSync(configFile, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  for (const [key, value] of [["IRIS_API_URL", apiUrl], ["IRIS_API_TOKEN", rawToken]] as const) {
    // 单引号转义使配置可安全地通过 shell source 加载。
    const assignment = `${key}='${value.replace(/'/g, "'\\''")}'`;
    const pattern = new RegExp(`^[\\t ]*(?:export[\\t ]+)?${key}[\\t ]*=.*$`, "gm");
    if (pattern.test(content)) {
      content = content.replace(pattern, () => assignment);
    } else {
      content += `${content && !content.endsWith("\n") ? "\n" : ""}${assignment}\n`;
    }
  }
  const stagingDir = mkdtempSync(join(configDir, ".config-"));
  try {
    const stagedFile = join(stagingDir, "config.env");
    writeFileSync(stagedFile, content, { encoding: "utf8", mode: 0o600 });
    renameSync(stagedFile, configFile);
  } finally {
    rmSync(stagingDir, { recursive: true, force: true });
  }
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
      "先交互询问 API URL；未填写或格式无效时，不生成 Token、不创建远程用户。\n" +
      "向 wrangler.jsonc 中 DB 绑定的远程 D1 创建新用户，再为该用户创建 Token。\n" +
      "核验成功后将 IRIS_API_URL 和 IRIS_API_TOKEN 保存到 ~/.iris/config.env。\n" +
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

  const apiUrl = await askApiUrl();
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
    try {
      const output = runWrangler([
        "d1", "execute", "DB", "--remote", "--config", join(PROJECT_ROOT, "wrangler.jsonc"),
        "--file", sqlFile, "--json",
      ]);
      parseWranglerResponse(output, "Wrangler 写入响应无法确认。");
    } catch {
      // 网络断开或输出格式变化不等于写入失败；只回读，不自动重试 INSERT。
      process.stderr.write(
        "Wrangler 写入响应未确认，正在按本次 ID 和 Token 摘要回读远程记录；不会重复写入。\n",
      );
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }

  const verifySql = [
    "SELECT users.id AS user_id, api_tokens.id AS token_id",
    "FROM users JOIN api_tokens ON api_tokens.user_id = users.id",
    `WHERE users.id = ${sqlLiteral(userId)} AND api_tokens.id = ${sqlLiteral(tokenId)}`,
    `AND api_tokens.token_hash = ${sqlLiteral(tokenHash)}`,
    `AND api_tokens.expires_at = ${expiresAt} AND api_tokens.revoked_at IS NULL;`,
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
      "本次不显示原始 Token。请先核查这两个 ID，不要直接重跑创建命令；" +
      "若记录已存在，原始 Token 无法恢复，需要撤销旧 Token 后另行签发。",
    );
  }
  const verifyResponse = parseWranglerResponse(
    verifyOutput,
    `无法确认远程记录。请按用户 ID ${userId} 和 Token ID ${tokenId} 核查；` +
      "本次不显示原始 Token，请勿直接重跑创建命令。",
  );
  const firstResult = verifyResponse[0];
  const rows = typeof firstResult === "object" && firstResult !== null && "results" in firstResult &&
      Array.isArray(firstResult.results) ? firstResult.results : [];
  if (rows.length !== 1 || rows[0]?.user_id !== userId || rows[0]?.token_id !== tokenId) {
    throw new Error(
      `远程记录核验不匹配。请分别核查用户 ID ${userId} 和 Token ID ${tokenId}，` +
      "排除部分写入或凭据不匹配后再处理；本次不显示原始 Token，请勿直接重跑创建命令。",
    );
  }

  let configSaved = false;
  try {
    saveConfig(apiUrl, rawToken);
    configSaved = true;
  } catch {
    process.stderr.write(
      "远程用户和 Token 已创建并核验，但本地 ~/.iris/config.env 保存失败。" +
      "请安全保存下方 Token，并手动配置 IRIS_API_URL 和 IRIS_API_TOKEN；不要重跑创建命令。\n",
    );
    process.exitCode = 1;
  }

  process.stdout.write([
    "",
    ...(configSaved ? ["IRIS_API_URL 和 IRIS_API_TOKEN 已保存到 ~/.iris/config.env（权限 600）。"] : []),
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
