const TOKEN_PREFIX = "iris_";
const TOKEN_RANDOM_BYTES = 32;
/** 32 字节 base64url 编码后固定为 43 个字符（无填充）。 */
const TOKEN_PATTERN = /^iris_[A-Za-z0-9_-]{43}$/;

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** 生成 `iris_<43 字符 base64url>` 格式的原始 Token，随机数来自 256 位安全随机源。 */
export function generateRawToken(): string {
  const bytes = new Uint8Array(TOKEN_RANDOM_BYTES);
  crypto.getRandomValues(bytes);
  return `${TOKEN_PREFIX}${toBase64Url(bytes)}`;
}

export function isWellFormedToken(rawToken: string): boolean {
  return TOKEN_PATTERN.test(rawToken);
}

/** 仅用于落库与查询。数据库中永远只保存 SHA-256，不保存原始 Token。 */
export async function hashToken(rawToken: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawToken));
  let hex = "";
  for (const byte of new Uint8Array(digest)) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}
