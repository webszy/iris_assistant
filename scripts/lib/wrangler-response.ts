import { stripVTControlCharacters } from "node:util";

/** Wrangler 的文件导入进度可能写入 stdout，即使指定了 --json。 */
export function parseWranglerResponse(output: string, failureMessage: string): unknown[] {
  const text = stripVTControlCharacters(output).trim();
  let response: unknown;
  try {
    // 只允许已知的树形进度行，不从任意错误文本中截取成功 JSON。
    const lines = text.split(/\r?\n/);
    while (lines.length > 0 && /^\s*[├│└]/u.test(lines[0]!)) {
      lines.shift();
    }
    response = JSON.parse(lines.join("\n"));
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
