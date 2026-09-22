import { ServiceError } from "../lib/service-error";

export interface ContentLocator { path: string }
export interface ContentSnapshot {
  content: string;
  revision: string;
  sizeBytes: number;
}

export interface ContentProvider {
  read(locator: ContentLocator): Promise<ContentSnapshot>;
  create(locator: ContentLocator, content: string, commitMessage: string): Promise<ContentSnapshot>;
  update(locator: ContentLocator, content: string, expectedRevision: string, commitMessage: string): Promise<ContentSnapshot>;
  /** Internal compensation only. There is deliberately no content DELETE route. */
  delete(locator: ContentLocator, revision: string, commitMessage: string): Promise<void>;
}

export class ContentProviderError extends ServiceError {
  constructor(
    readonly operation: string,
    readonly status?: number,
    readonly outcome: "failed" | "unknown" = "failed",
    readonly requestId?: string,
  ) {
    super("CONTENT_PROVIDER_ERROR", "Content provider unavailable or misconfigured.");
    this.name = "ContentProviderError";
  }
}
