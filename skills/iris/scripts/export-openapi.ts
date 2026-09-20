/**
 * 从应用自身导出 OpenAPI 文档到 references/openapi.json。
 * 不启动服务器、不连数据库：直接构造 Hono app 并请求 /openapi.json。
 *
 * 用法（在仓库根目录执行）：
 *   ./node_modules/.bin/tsx skills/iris/scripts/export-openapi.ts
 *
 * 注意：本文件刻意放在 skills/ 下，因为 scripts/** 属于 tsconfig.scripts.json 的
 * 编译范围（types 仅含 node），而本脚本需要导入 src/（依赖 @cloudflare/workers-types）。
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { createApp } from "../../../src/app";

const outPath = resolve(process.argv[2] ?? "skills/iris/references/openapi.json");

const app = createApp();
const res = await app.request("/openapi.json");

if (!res.ok) {
  throw new Error(`导出失败：/openapi.json 返回 ${res.status}`);
}

const doc = (await res.json()) as { paths?: Record<string, unknown> };
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(doc, null, 2)}\n`, "utf8");

console.log(`已写入 ${outPath}（${Object.keys(doc.paths ?? {}).length} 个路径）`);
