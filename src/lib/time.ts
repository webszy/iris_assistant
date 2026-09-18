/**
 * D1 中所有时间列以 UTC Unix epoch milliseconds（INTEGER）存储；
 * 对外输出统一转换为 ISO 8601 UTC 字符串。
 */
export function nowEpochMs(): number {
  return Date.now();
}

export function toIso8601Utc(epochMs: number): string {
  return new Date(epochMs).toISOString();
}
