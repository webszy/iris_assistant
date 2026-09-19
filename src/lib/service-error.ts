import type { ErrorCode } from "./error-codes";

export type ServiceErrorCode = Exclude<ErrorCode,
  "BAD_REQUEST" | "UNAUTHORIZED" | "NOT_FOUND" | "INTERNAL_ERROR"
>;

/** 业务失败，只携带业务错误码和安全文案；HTTP 映射由入口层负责。 */
export class ServiceError extends Error {
  constructor(readonly code: ServiceErrorCode, message: string) {
    super(message);
    this.name = "ServiceError";
  }
}
