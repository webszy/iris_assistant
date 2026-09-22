/**
 * 从应用自身导出 OpenAPI 文档到 Skill 的 references/openapi.json。
 * 不启动服务器、不连数据库：直接构造 Hono app 并请求 /openapi.json。
 *
 * 用法（在仓库根目录执行）：
 *   pnpm run openapi:export              # 生成并写入 skills/iris/references/openapi.json
 *   pnpm run openapi:export -- <path>    # 写入指定路径（覆盖默认输出）
 *   pnpm run openapi:check               # 只校验：产物与当前源码一致才通过（CI 用，不写文件）
 *
 * 行为约定：
 *   1. 先校验、后写盘。校验不通过时列出全部问题并以非零码退出，绝不覆盖已有产物。
 *   2. 校验覆盖结构性契约（bearerAuth、响应定义、$ref 可解析）与安全边界
 *      （不得出现未批准的 hard delete / execute / run 操作），口径与 tests/routes.test.ts 一致。
 *   3. 每次导出都会打印路径/操作/schema 数量，以及与既有产物的差异，便于人工复核 diff。
 *
 * 注意：本文件位于 scripts/**（由 tsconfig.scripts.json 覆盖），但需要导入 src/，
 * 因此该 tsconfig 的 types 同时声明了 node 与 @cloudflare/workers-types：
 * 只用 node 会让 src/ 里的 Workers 全局类型（Request/Response 等）缺失。
 * 输出路径默认相对进程工作目录解析，请始终在仓库根目录执行本脚本。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { createApp } from "../src/app";

const HTTP_METHODS = [
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace",
] as const;

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const outPath = resolve(
  args.find((arg) => !arg.startsWith("--")) ?? "skills/iris/references/openapi.json",
);

/** 受保护前缀：这些路径下的每个操作都必须显式声明 bearerAuth。 */
const PROTECTED_PREFIX = "/api/v1/";
/** 公开路径：不得声明 bearerAuth。 */
const PUBLIC_PATHS = ["/health"];
/** 未批准的 hard delete（与 tests/routes.test.ts 的断言一致）。 */
const FORBIDDEN_OPERATIONS = [
  "DELETE /api/v1/projects/{projectId}",
  "DELETE /api/v1/projects/{projectId}/milestones/{milestoneId}",
  "DELETE /api/v1/projects/{projectId}/tasks/{taskId}",
  "DELETE /api/v1/projects/{projectId}/capabilities/{capabilityId}",
];

function operationsOf(doc: JsonObject): Map<string, JsonObject> {
  const operations = new Map<string, JsonObject>();
  if (!isObject(doc.paths)) {
    return operations;
  }
  for (const [path, item] of Object.entries(doc.paths)) {
    if (!isObject(item)) {
      continue;
    }
    for (const [method, operation] of Object.entries(item)) {
      if (!HTTP_METHODS.includes(method as (typeof HTTP_METHODS)[number])) {
        continue;
      }
      if (isObject(operation)) {
        operations.set(`${method.toUpperCase()} ${path}`, operation);
      }
    }
  }
  return operations;
}

function collectRefs(value: unknown, found: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectRefs(item, found);
    }
    return found;
  }
  if (isObject(value)) {
    for (const [key, child] of Object.entries(value)) {
      if (key === "$ref" && typeof child === "string") {
        found.push(child);
      } else {
        collectRefs(child, found);
      }
    }
  }
  return found;
}

function resolvePointer(doc: JsonObject, ref: string): unknown {
  const segments = ref
    .replace(/^#\//, "")
    .split("/")
    .map((segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~"));
  let current: unknown = doc;
  for (const segment of segments) {
    if (!isObject(current) || !(segment in current)) {
      return undefined;
    }
    current = current[segment];
  }
  return current;
}

/** 返回全部问题描述；空数组代表校验通过。 */
function validate(doc: JsonObject): string[] {
  const problems: string[] = [];

  if (typeof doc.openapi !== "string" || !doc.openapi.startsWith("3.")) {
    problems.push(`openapi 版本声明异常：${JSON.stringify(doc.openapi)}`);
  }
  if (!isObject(doc.info) || typeof doc.info.title !== "string" || typeof doc.info.version !== "string") {
    problems.push("info.title / info.version 缺失");
  }
  if (!isObject(doc.paths) || Object.keys(doc.paths).length === 0) {
    problems.push("paths 为空：没有导出到任何路由");
  }

  const securitySchemes = isObject(doc.components) ? doc.components.securitySchemes : undefined;
  if (!isObject(securitySchemes) || !isObject(securitySchemes.bearerAuth)) {
    problems.push("components.securitySchemes.bearerAuth 缺失");
  }

  const operations = operationsOf(doc);
  if (operations.size === 0) {
    problems.push("没有解析到任何操作（HTTP 方法）");
  }

  for (const [key, operation] of operations) {
    const [, path = ""] = key.split(" ");
    const responses = operation.responses;
    if (!isObject(responses) || Object.keys(responses).length === 0) {
      problems.push(`${key} 缺少响应定义`);
    } else if (!Object.keys(responses).some((status) => /^2\d\d$/.test(status))) {
      problems.push(`${key} 没有声明任何 2xx 响应`);
    }

    if (path.startsWith(PROTECTED_PREFIX)) {
      const security = operation.security;
      if (
        !Array.isArray(security) ||
        security.length !== 1 ||
        !isObject(security[0]) ||
        !("bearerAuth" in security[0])
      ) {
        problems.push(`${key} 缺少 bearerAuth 声明`);
      }
    }

    if (PUBLIC_PATHS.includes(path) && operation.security !== undefined) {
      const security = operation.security;
      if (Array.isArray(security) && security.length > 0) {
        problems.push(`${key} 是公开路径，不应声明 security`);
      }
    }

    if (key.includes("execute") || key.includes("run")) {
      problems.push(`${key} 命中未批准的能力执行操作`);
    }
    if (FORBIDDEN_OPERATIONS.includes(key)) {
      problems.push(`${key} 命中未批准的 hard delete 操作`);
    }
  }

  for (const ref of new Set(collectRefs(doc))) {
    if (!ref.startsWith("#/")) {
      problems.push(`存在外部 $ref：${ref}`);
      continue;
    }
    if (resolvePointer(doc, ref) === undefined) {
      problems.push(`$ref 无法解析：${ref}`);
    }
  }

  return problems;
}

function summarize(doc: JsonObject): string {
  const operations = operationsOf(doc);
  const schemas = isObject(doc.components) && isObject(doc.components.schemas)
    ? Object.keys(doc.components.schemas).length
    : 0;
  const paths = isObject(doc.paths) ? Object.keys(doc.paths).length : 0;
  return `${paths} 个路径 / ${operations.size} 个操作 / ${schemas} 个 schema`;
}

/** 与既有产物对比，打印新增与移除，避免产物静默漂移。 */
function reportDiff(doc: JsonObject): void {
  if (!existsSync(outPath)) {
    console.log("（首次生成：磁盘上还没有既有产物）");
    return;
  }

  let previous: JsonObject;
  try {
    const parsed: unknown = JSON.parse(readFileSync(outPath, "utf8"));
    if (!isObject(parsed)) {
      console.log("（既有产物不是 JSON 对象，跳过差异对比）");
      return;
    }
    previous = parsed;
  } catch {
    console.log("（既有产物无法解析，跳过差异对比）");
    return;
  }

  const before = new Set(operationsOf(previous).keys());
  const after = new Set(operationsOf(doc).keys());
  const added = [...after].filter((key) => !before.has(key));
  const removed = [...before].filter((key) => !after.has(key));

  if (added.length === 0 && removed.length === 0) {
    console.log("与既有产物相比：无操作增减");
    return;
  }
  for (const key of added) {
    console.log(`  + ${key}`);
  }
  for (const key of removed) {
    console.log(`  - ${key}`);
  }
}

const app = createApp();
const res = await app.request("/openapi.json");

if (!res.ok) {
  console.error(`导出失败：/openapi.json 返回 ${res.status}`);
  process.exit(1);
}

const parsedDoc: unknown = await res.json();
if (!isObject(parsedDoc)) {
  console.error("导出失败：/openapi.json 返回的不是 JSON 对象");
  process.exit(1);
}

const problems = validate(parsedDoc);
if (problems.length > 0) {
  console.error(`校验未通过（${problems.length} 项），未写入任何文件：`);
  for (const problem of problems) {
    console.error(`  ✗ ${problem}`);
  }
  process.exit(1);
}

const serialized = `${JSON.stringify(parsedDoc, null, 2)}\n`;

if (checkOnly) {
  if (!existsSync(outPath)) {
    console.error(`校验失败：产物不存在 ${outPath}，请先运行 pnpm openapi:export`);
    process.exit(1);
  }
  if (readFileSync(outPath, "utf8") !== serialized) {
    console.error(`校验失败：${outPath} 与当前源码不一致，请运行 pnpm openapi:export 重新生成`);
    process.exit(1);
  }
  console.log(`校验通过：${outPath} 与当前源码一致（${summarize(parsedDoc)}）`);
  process.exit(0);
}

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, serialized, "utf8");

console.log(`已写入 ${outPath}（${summarize(parsedDoc)}）`);
reportDiff(parsedDoc);
