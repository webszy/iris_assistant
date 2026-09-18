import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { generateRawToken } from "../src/lib/token";
import { bearerHeaders, readJson, seedIdentity } from "./helpers";

const ENDPOINT = "https://iris.test/api/v1/test";

interface ErrorBody {
  success: boolean;
  error: { code: string; message: string };
}

interface TestSuccessBody {
  success: boolean;
  data: {
    message: string;
    user: {
      id: string;
      name: string;
      timezone: string;
      locale: string;
      defaultCurrency: string;
      createdAt: string;
      updatedAt: string;
    };
    tokenId: string;
    requestedAt: string;
  };
}

async function expectUnauthorized(response: Response): Promise<void> {
  expect(response.status).toBe(401);
  expect(response.headers.get("WWW-Authenticate")).toBe("Bearer");
  const body = await readJson<ErrorBody>(response);
  expect(body.success).toBe(false);
  expect(body.error.code).toBe("UNAUTHORIZED");
  expect(typeof body.error.message).toBe("string");
}

describe("GET /api/v1/test 认证场景", () => {
  it.each(["Bearer", "bearer", "BEARER", "bEaReR"])("认证方案 %s 接受有效 Token", async (scheme) => {
    const identity = await seedIdentity();
    const response = await SELF.fetch(ENDPOINT, {
      headers: { Authorization: `${scheme} ${identity.rawToken}` },
    });
    expect(response.status).toBe(200);
    expect(response.headers.has("WWW-Authenticate")).toBe(false);
    const body = await readJson<TestSuccessBody>(response);
    expect(body.data.user.id).toBe(identity.userId);
  });

  it("Token 自身仍区分大小写", async () => {
    const identity = await seedIdentity();
    const altered = identity.rawToken.replace(/[a-zA-Z]/g, (character, offset: number) =>
      offset < 5 ? character : character === character.toLowerCase()
        ? character.toUpperCase() : character.toLowerCase(),
    );
    expect(altered).not.toBe(identity.rawToken);
    await expectUnauthorized(await SELF.fetch(ENDPOINT, { headers: bearerHeaders(altered) }));
  });

  it("缺少 Authorization 头时返回统一 401", async () => {
    await expectUnauthorized(await SELF.fetch(ENDPOINT));
  });

  it("Bearer 格式错误时返回统一 401", async () => {
    const malformed = ["Basic abc", "Bearer", "bearer iris_abc", "Token abc", "Bearer    "];
    for (const value of malformed) {
      await expectUnauthorized(
        await SELF.fetch(ENDPOINT, { headers: { Authorization: value } }),
      );
    }
  });

  it("Token 结构非法时返回统一 401", async () => {
    await expectUnauthorized(
      await SELF.fetch(ENDPOINT, { headers: bearerHeaders("iris_not-a-valid-token") }),
    );
  });

  it("不存在的 Token 返回统一 401", async () => {
    await expectUnauthorized(
      await SELF.fetch(ENDPOINT, { headers: bearerHeaders(generateRawToken()) }),
    );
  });

  it("已 revoke 的 Token 返回统一 401", async () => {
    const identity = await seedIdentity({ revokedAt: Date.now() });
    await expectUnauthorized(
      await SELF.fetch(ENDPOINT, { headers: bearerHeaders(identity.rawToken) }),
    );
  });

  it("已过期的 Token 返回统一 401", async () => {
    const identity = await seedIdentity({ expiresAt: Date.now() - 1000 });
    await expectUnauthorized(
      await SELF.fetch(ENDPOINT, { headers: bearerHeaders(identity.rawToken) }),
    );
  });

  it("有效 Token 返回 200、统一成功响应与由 Token 识别的当前用户", async () => {
    const identity = await seedIdentity();
    const response = await SELF.fetch(ENDPOINT, { headers: bearerHeaders(identity.rawToken) });

    expect(response.status).toBe(200);
    const body = await readJson<TestSuccessBody>(response);
    expect(body.success).toBe(true);
    expect(body.data.user.id).toBe(identity.userId);
    expect(body.data.user.name).toBe(identity.name);
    expect(body.data.user.timezone).toBe("Asia/Shanghai");
    expect(body.data.user.locale).toBe("zh-CN");
    expect(body.data.user.defaultCurrency).toBe("CNY");
    expect(body.data.tokenId).toBe(identity.tokenId);
    expect(Number.isNaN(Date.parse(body.data.user.createdAt))).toBe(false);
    expect(Number.isNaN(Date.parse(body.data.user.updatedAt))).toBe(false);
  });

  it("不读取客户端传入的 user_id", async () => {
    const identity = await seedIdentity();
    const other = await seedIdentity();

    const response = await SELF.fetch(`${ENDPOINT}?user_id=${other.userId}`, {
      headers: bearerHeaders(identity.rawToken),
    });

    expect(response.status).toBe(200);
    const body = await readJson<TestSuccessBody>(response);
    expect(body.data.user.id).toBe(identity.userId);
    expect(body.data.user.id).not.toBe(other.userId);
  });

  it("有效请求会更新对应 api_tokens.last_used_at", async () => {
    const identity = await seedIdentity();

    const before = await env.DB.prepare("SELECT last_used_at FROM api_tokens WHERE id = ?")
      .bind(identity.tokenId)
      .first<{ last_used_at: number | null }>();
    expect(before?.last_used_at).toBeNull();

    const response = await SELF.fetch(ENDPOINT, { headers: bearerHeaders(identity.rawToken) });
    expect(response.status).toBe(200);

    const after = await env.DB.prepare("SELECT last_used_at FROM api_tokens WHERE id = ?")
      .bind(identity.tokenId)
      .first<{ last_used_at: number | null }>();
    expect(typeof after?.last_used_at).toBe("number");
    expect(Number.isInteger(after?.last_used_at)).toBe(true);
  });
});
