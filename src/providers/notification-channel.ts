import type { Env } from "../types/env";

export const DELIVERY_ERROR_CODES = ["TIMEOUT", "RATE_LIMITED", "PROVIDER_5XX", "NETWORK_ERROR",
  "PROVIDER_UNAVAILABLE", "INVALID_DESTINATION", "UNSUPPORTED_PAYLOAD", "AUTH_ERROR",
  "MISSING_RUNTIME_CONFIG", "ADAPTER_UNAVAILABLE", "RETRY_EXHAUSTED", "PROVIDER_REJECTED"] as const;
export type DeliveryErrorCode = typeof DELIVERY_ERROR_CODES[number];
export type DeliveryResult =
  | { outcome: "sent"; providerMessageId?: string }
  | { outcome: "retryable" | "terminal"; code: DeliveryErrorCode; providerStatus?: number };
export interface NotificationSendInput {
  deliveryId: string;
  idempotencyKey: string;
  notificationId: string;
  userId: string;
  title: string;
  body: string | null;
  sourceType: "reminder_occurrence";
  sourceId: string;
  sourceVersion: number;
  sourceContext: { reminderId: string } | null;
  signal: AbortSignal;
}
export interface NotificationChannelAdapter {
  readonly channel: string;
  /** Pure synchronous runtime configuration check; never calls a provider. */
  isUsable(env: Env): boolean;
  /** Honor signal, normalize provider failures, and reuse input.idempotencyKey. */
  send(input: NotificationSendInput, env: Env): Promise<DeliveryResult>;
}
export type NotificationAdapters = ReadonlyMap<string, NotificationChannelAdapter>;
/** No production provider contract exists yet. Test adapters must be explicitly injected. */
export function productionNotificationAdapters(): NotificationAdapters { return new Map(); }
export function usableAdapterNames(adapters: NotificationAdapters, env: Env): string[] {
  return [...adapters].filter(([, adapter]) => adapter.isUsable(env)).map(([name]) => name);
}
/** Shared HTTP classification for future adapters; never retain provider response bodies. */
export function classifyNotificationHttpFailure(status: number): Exclude<DeliveryResult, { outcome: "sent" }> {
  if (status === 429) return { outcome: "retryable", code: "RATE_LIMITED", providerStatus: status };
  if (status >= 500 && status <= 599) return { outcome: "retryable", code: "PROVIDER_5XX", providerStatus: status };
  if (status === 408) return { outcome: "retryable", code: "TIMEOUT", providerStatus: status };
  if (status === 401 || status === 403) return { outcome: "terminal", code: "AUTH_ERROR", providerStatus: status };
  return { outcome: "terminal", code: "PROVIDER_REJECTED", providerStatus: status };
}
