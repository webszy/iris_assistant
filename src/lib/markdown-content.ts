import { ServiceError } from "./service-error";

export const MAX_MARKDOWN_CONTENT_BYTES = 5 * 1024 * 1024;

/** No repair/normalization: a caller must supply canonical POSIX segments. */
function canonicalSegments(path: string): string[] | undefined {
  if (!path || /[\\\u0000-\u001f\u007f]/.test(path) || /^[a-z]:/i.test(path)) return undefined;
  const parts = path.split("/");
  return parts.some(part => !part || part === "." || part === "..") ? undefined : parts;
}

export function isMarkdownPath(path: string): boolean {
  return path.endsWith(".md") || path.endsWith(".markdown");
}

export function belongsToProject(path: string, projectId: string): boolean {
  const parts = canonicalSegments(path);
  return parts !== undefined && parts.length > 2 && parts[0] === "projects"
    && parts[1] === projectId && isMarkdownPath(path);
}

export function markdownPhysicalPath(projectId: string, relativePath: string): string {
  const idParts = canonicalSegments(projectId);
  if (idParts?.length !== 1) throw new Error("Invalid project namespace");
  if (!canonicalSegments(relativePath) || !isMarkdownPath(relativePath)) {
    throw new ServiceError("INVALID_RESOURCE_LOCATION", "path must be a canonical relative Markdown path.");
  }
  const path = `projects/${projectId}/${relativePath}`;
  if (!belongsToProject(path, projectId)) throw new Error("Invalid project namespace");
  return path;
}

export function checkContentSize(sizeBytes: number): void {
  if (sizeBytes > MAX_MARKDOWN_CONTENT_BYTES) {
    throw new ServiceError("CONTENT_TOO_LARGE", "Content exceeds the Iris Markdown size limit.");
  }
}

export function contentSize(content: string): number {
  const size = new TextEncoder().encode(content).byteLength;
  checkContentSize(size);
  return size;
}

export function defaultCommitMessage(operation: "Add" | "Update", name: string): string {
  return Array.from(`${operation} ${name}`).slice(0, 200).join("").trim();
}
