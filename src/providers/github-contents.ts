import { checkContentSize, contentSize, MAX_MARKDOWN_CONTENT_BYTES } from "../lib/markdown-content";
import { ServiceError } from "../lib/service-error";
import type { Env } from "../types/env";
import { ContentProviderError, type ContentLocator, type ContentProvider, type ContentSnapshot } from "./content-provider";

type JsonObject = Record<string, unknown>;
function object(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isSha(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{40}$/.test(value);
}

interface Configuration { repository: string; owner: string; repo: string; branch: string; token: string }
export function memoryConfiguration(env: Env): Configuration {
  const repository = env.IRIS_MEMORY_REPOSITORY?.trim();
  const owner = env.IRIS_MEMORY_GITHUB_OWNER?.trim();
  const repo = env.IRIS_MEMORY_GITHUB_REPO?.trim();
  const branch = env.IRIS_MEMORY_GITHUB_BRANCH?.trim();
  const token = env.GITHUB_TOKEN?.trim();
  if (!repository || !owner || !repo || !branch || !token
    || !/^[a-zA-Z0-9-]+$/.test(owner) || !/^[a-zA-Z0-9_.-]+$/.test(repo)
    || repo === "." || repo === ".." || /[\u0000-\u001f\u007f]/.test(branch)) {
    throw new ContentProviderError("configuration");
  }
  return { repository, owner, repo, branch, token };
}

function encodeContent(content: string): string {
  const bytes = new TextEncoder().encode(content);
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 8192)));
  }
  return btoa(chunks.join(""));
}

/** Verifies that metadata and the returned bytes describe the same Git blob. */
async function blobRevision(bytes: Uint8Array): Promise<string> {
  const header = new TextEncoder().encode(`blob ${bytes.byteLength}\0`);
  const input = new Uint8Array(header.byteLength + bytes.byteLength);
  input.set(header);
  input.set(bytes, header.byteLength);
  const digest = await crypto.subtle.digest("SHA-1", input);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

interface Metadata { sha: string; size: number; content?: string; encoding?: string }

export class GitHubContentsProvider implements ContentProvider {
  private readonly base: string;
  constructor(private readonly config: Configuration, private readonly fetcher: typeof fetch = fetch) {
    this.base = `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`;
  }

  private failure(operation: string, response?: Response, outcome: "failed" | "unknown" = "failed") {
    const id = response?.headers.get("x-github-request-id");
    return new ContentProviderError(operation, response?.status, outcome,
      id && /^[a-zA-Z0-9:-]{1,128}$/.test(id) ? id : undefined);
  }

  private async request(operation: string, suffix: string, method = "GET", body?: unknown, media: "json" | "object" | "raw" = "json"): Promise<Response> {
    try {
      return await this.fetcher(this.base + suffix, {
        method,
        headers: {
          Authorization: `Bearer ${this.config.token}`,
          Accept: `application/vnd.github${media === "json" ? "" : `.${media}`}+json`,
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "Iris-Resource-Content",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        // Workers supports manual/follow only. Callers reject 3xx status codes;
        // never follow redirects or forward credentials to a response-provided URL.
        redirect: "manual",
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw this.failure(operation, undefined, method === "GET" ? "failed" : "unknown");
    }
  }

  private async bytes(response: Response, operation: string, limit: number, markdown = false): Promise<Uint8Array> {
    const reader = response.body?.getReader();
    if (!reader) throw this.failure(operation, response);
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > limit) {
          await reader.cancel().catch(() => undefined);
          if (markdown) checkContentSize(size);
          throw this.failure(operation, response);
        }
        chunks.push(chunk.value);
      }
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      throw this.failure(operation, response);
    } finally {
      reader.releaseLock();
    }
    const result = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
    return result;
  }

  private async json(response: Response, operation: string, mutation = false): Promise<unknown> {
    try {
      return JSON.parse(new TextDecoder().decode(await this.bytes(response, operation, 2 * 1024 * 1024)));
    } catch {
      throw this.failure(operation, response, mutation ? "unknown" : "failed");
    }
  }

  private contentsPath(path: string, commit?: string): string {
    const encoded = path.split("/").map(encodeURIComponent).join("/");
    return `/contents/${encoded}${commit ? `?ref=${encodeURIComponent(commit)}` : ""}`;
  }

  /** A missing/inaccessible repo or branch is a provider error, never file-not-found. */
  private async branchCommit(): Promise<string> {
    const response = await this.request("branch", `/branches/${encodeURIComponent(this.config.branch)}`);
    if (response.status !== 200) throw this.failure("branch", response);
    const data = await this.json(response, "branch");
    if (!object(data) || !object(data.commit) || !isSha(data.commit.sha)) throw this.failure("branch", response);
    return data.commit.sha;
  }

  private async entry(path: string, commit: string): Promise<unknown | undefined> {
    const response = await this.request("metadata", this.contentsPath(path, commit), "GET", undefined, "object");
    if (response.status === 404) return undefined;
    if (response.status !== 200) throw this.failure("metadata", response);
    return this.json(response, "metadata");
  }

  private metadata(data: unknown): Metadata {
    // Symlinks/submodules must not let an in-project pointer read another location.
    if (!object(data) || data.type !== "file" || "target" in data || data.submodule_git_url
      || !isSha(data.sha) || typeof data.size !== "number" || !Number.isSafeInteger(data.size) || data.size < 0) {
      throw this.failure("metadata");
    }
    checkContentSize(data.size);
    return {
      sha: data.sha, size: data.size,
      content: typeof data.content === "string" ? data.content : undefined,
      encoding: typeof data.encoding === "string" ? data.encoding : undefined,
    };
  }

  async read({ path }: ContentLocator): Promise<ContentSnapshot> {
    const commit = await this.branchCommit();
    const data = await this.entry(path, commit);
    if (data === undefined) throw new ServiceError("CONTENT_NOT_FOUND", "Resource content does not exist.");
    const metadata = this.metadata(data);
    let bytes: Uint8Array;
    if (metadata.encoding === "base64" && metadata.content !== undefined) {
      try {
        const binary = atob(metadata.content.replace(/\s/g, ""));
        bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
      } catch { throw this.failure("decode"); }
      checkContentSize(bytes.byteLength);
    } else {
      // Immutable commit ref binds raw bytes and metadata even if the branch moves.
      const response = await this.request("raw", this.contentsPath(path, commit), "GET", undefined, "raw");
      if (response.status !== 200) throw this.failure("raw", response);
      bytes = await this.bytes(response, "raw", MAX_MARKDOWN_CONTENT_BYTES, true);
    }
    if (bytes.byteLength !== metadata.size || await blobRevision(bytes) !== metadata.sha) throw this.failure("snapshot");
    let content: string;
    try {
      // Keep a UTF-8 BOM and all line endings; reject binary/non-UTF-8 contents.
      content = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
    } catch { throw this.failure("decode"); }
    return { content, revision: metadata.sha, sizeBytes: bytes.byteLength };
  }

  async create({ path }: ContentLocator, content: string, commitMessage: string): Promise<ContentSnapshot> {
    contentSize(content);
    const commit = await this.branchCommit();
    if (await this.entry(path, commit) !== undefined) {
      throw new ServiceError("CONTENT_ALREADY_EXISTS", "Resource content already exists.");
    }
    return this.write(path, content, commitMessage);
  }

  async update({ path }: ContentLocator, content: string, expectedRevision: string, commitMessage: string): Promise<ContentSnapshot> {
    contentSize(content);
    const commit = await this.branchCommit();
    const data = await this.entry(path, commit);
    if (data === undefined) throw new ServiceError("CONTENT_NOT_FOUND", "Resource content does not exist.");
    const metadata = this.metadata(data);
    if (metadata.sha !== expectedRevision) this.conflict();
    // Always let GitHub atomically check the SHA, including identical submissions.
    return this.write(path, content, commitMessage, expectedRevision);
  }

  private conflict(): never {
    throw new ServiceError("CONTENT_CONFLICT", "Content changed since it was read. Re-read the resource before updating.");
  }

  private async write(path: string, content: string, message: string, revision?: string): Promise<ContentSnapshot> {
    const operation = revision === undefined ? "create" : "update";
    const response = await this.request(operation, this.contentsPath(path), "PUT", {
      message, content: encodeContent(content), branch: this.config.branch,
      ...(revision === undefined ? {} : { sha: revision }),
    });
    if (response.status === 409 || response.status === 422) {
      // Classify a race by a read; never retry the write with a newer revision.
      const current = await this.entry(path, await this.branchCommit());
      if (revision === undefined && current !== undefined) {
        throw new ServiceError("CONTENT_ALREADY_EXISTS", "Resource content already exists.");
      }
      if (revision !== undefined) {
        if (current === undefined) throw new ServiceError("CONTENT_NOT_FOUND", "Resource content does not exist.");
        if (this.metadata(current).sha !== revision) this.conflict();
      }
    }
    if (response.status !== (revision === undefined ? 201 : 200)) {
      throw this.failure(operation, response, response.status >= 500 || response.ok ? "unknown" : "failed");
    }
    const data = await this.json(response, operation, true);
    const expected = await blobRevision(new TextEncoder().encode(content));
    if (!object(data) || !object(data.content) || data.content.sha !== expected) {
      throw this.failure(operation, response, "unknown");
    }
    return { content, revision: expected, sizeBytes: contentSize(content) };
  }

  async delete({ path }: ContentLocator, revision: string, commitMessage: string): Promise<void> {
    const response = await this.request("rollback", this.contentsPath(path), "DELETE", {
      message: commitMessage, sha: revision, branch: this.config.branch,
    });
    if (response.status !== 200) throw this.failure("rollback", response, response.status >= 500 ? "unknown" : "failed");
    const data = await this.json(response, "rollback", true);
    if (!object(data) || data.content !== null || !object(data.commit) || !isSha(data.commit.sha)) {
      throw this.failure("rollback", response, "unknown");
    }
  }
}
