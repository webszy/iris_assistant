import assert from "node:assert/strict";
import { test } from "node:test";

import { parseWranglerResponse } from "./wrangler-response";

const success = [{ results: [], success: true }];
const json = JSON.stringify(success, null, 2);

test("接受普通查询 JSON", () => {
  assert.deepEqual(parseWranglerResponse(json, "failed"), success);
});

test("接受 Wrangler 文件导入的进度前缀及 ANSI 颜色", () => {
  const output = "\u001b[32m├ Checking if file needs uploading\u001b[0m\r\n│\r\n" +
    "├ 🌀 Uploading database.sql\r\n│ 🌀 Uploading complete.\r\n│\r\n" + json;
  assert.deepEqual(parseWranglerResponse(output, "failed"), success);
});

test("拒绝错误、空数组、部分失败、截断和尾部杂讯", () => {
  for (const output of [
    "", "[]", '{"success":true}', '[{"success":false}]',
    '[{"success":true},{"success":false}]', '[{"success":"true"}]',
    "├ Uploading\n[", `ERROR: failed\n${json}`, `${json}\nERROR: failed`,
  ]) {
    assert.throws(() => parseWranglerResponse(output, "failed"), /failed/);
  }
});
