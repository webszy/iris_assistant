# 远程身份创建失败后的核查与复测

Wrangler 4.135.0 的 `d1 execute --file --json` 可能在 JSON 前输出树形上传进度。
创建脚本会跳过该进度前缀并严格检查结果；写入响应异常时仍会回读，只有用户 ID、
Token ID、Token 摘要、有效期及未撤销状态全部匹配才显示原始 Token，不自动重试写入。

## 本地复测

以下步骤需手动执行，解析测试不会访问 Cloudflare：

```bash
pnpm exec tsx --test scripts/lib/wrangler-response.node-test.ts
pnpm run typecheck
```

预期：普通 JSON、带进度和颜色的 JSON 通过；错误文本、部分失败、截断和尾部杂讯被拒绝。
此测试使用 Node test runner，文件名刻意避开项目的 Cloudflare Vitest 自动发现规则。

## 已有记录的处理

2026-09-21 核查到两组已写入但未显示原始 Token 的记录：

| 用户 ID | Token ID |
| --- | --- |
| 75f2a640-9e8b-45d2-ad1e-90f8b150ff3a | c5d27028-c77b-4c9e-ac4a-22b9daf3de90 |
| c0859ad4-ee2e-4e0f-91c0-687ea466c243 | 07e027d8-6a17-4ef0-ad3f-36e09017b61f |

原始 Token 没有持久化，不能从 SHA-256 摘要恢复。以下撤销 SQL 尚未执行；执行前应再次核对 ID：

```sql
UPDATE api_tokens SET revoked_at = unixepoch() * 1000
WHERE revoked_at IS NULL AND (
  (id = 'c5d27028-c77b-4c9e-ac4a-22b9daf3de90' AND user_id = '75f2a640-9e8b-45d2-ad1e-90f8b150ff3a')
  OR (id = '07e027d8-6a17-4ef0-ad3f-36e09017b61f' AND user_id = 'c0859ad4-ee2e-4e0f-91c0-687ea466c243')
);
```

这只撤销指定 Token，不删除用户或关联业务数据。执行后应回读 `revoked_at` 确认。

## 远程复测

确认需要新建一组身份后，手动执行一次 `pnpm run auth:create-remote`。
当前 package.json 默认使用 admin / admin-key，**每次运行仍会创建新用户**，不是给现有用户补发 Token。

预期显示“线上用户和 Token 已创建”，并显示一次原始 Token；立即安全保存。
用新 Token 请求已部署服务的 `GET /api/v1/test`，预期认证成功。
如果失败，保留本次两个 ID，分别核查 users / api_tokens，再决定后续操作，不连续重跑创建命令。

如果进程退出前始终无法核验，原始 Token 仍不会输出或落盘；需要撤销已存在的旧 Token 后另行处理。
