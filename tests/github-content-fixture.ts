import { vi } from "vitest";

export const githubTestConfiguration = {
  repository: "iris-memory", owner: "test-owner", repo: "test-memory", branch: "memory/test", token: "fake-github-secret",
};
export const githubTestEnv = {
  IRIS_MEMORY_REPOSITORY: githubTestConfiguration.repository,
  IRIS_MEMORY_GITHUB_OWNER: githubTestConfiguration.owner,
  IRIS_MEMORY_GITHUB_REPO: githubTestConfiguration.repo,
  IRIS_MEMORY_GITHUB_BRANCH: githubTestConfiguration.branch,
  GITHUB_TOKEN: githubTestConfiguration.token,
};

export async function gitBlob(content: string) {
  const data = new TextEncoder().encode(content);
  const prefix = new TextEncoder().encode(`blob ${data.length}\0`);
  const bytes = new Uint8Array(prefix.length + data.length);
  bytes.set(prefix); bytes.set(data, prefix.length);
  const hash = await crypto.subtle.digest("SHA-1", bytes);
  return Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2, "0")).join("");
}
function base64(content: string) {
  const bytes = new TextEncoder().encode(content);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}
interface File { content: string; sha: string }
export interface GithubRequest { url: URL; method: string; headers: Headers; body: Record<string, unknown> }

/** Stateful upstream fixture: immutable commits, blob revisions and conditional writes. No network. */
export function githubFixture() {
  const files = new Map<string, File>();
  const commits = new Map<string, Map<string, File>>();
  const requests: GithubRequest[] = [];
  let head = "1".padStart(40, "0");
  commits.set(head, new Map());
  const hooks: { intercept?: (request: GithubRequest) => Promise<Response | undefined> } = {};
  function commit() {
    head = (commits.size + 1).toString(16).padStart(40, "0");
    commits.set(head, new Map(files));
  }
  async function put(path: string, content: string) {
    const file = { content, sha: await gitBlob(content) };
    files.set(path, file); commit();
    return file;
  }
  const fetcher = vi.fn<typeof fetch>(async (input, init) => {
    const req = new Request(input, init);
    const url = new URL(req.url);
    const request: GithubRequest = {
      url, method: req.method, headers: req.headers,
      body: req.method === "GET" ? {} : await req.json() as Record<string, unknown>,
    };
    requests.push(request);
    const overridden = await hooks.intercept?.(request);
    if (overridden) return overridden;
    if (url.hostname !== "api.github.com") throw new Error("Unexpected host");
    if (url.pathname.includes("/branches/")) return Response.json({ commit: { sha: head } });
    const path = url.pathname.split("/contents/")[1]?.split("/").map(decodeURIComponent).join("/");
    if (path === undefined) throw new Error("Unexpected endpoint");
    if (req.method === "GET") {
      const file = commits.get(url.searchParams.get("ref") ?? head)?.get(path);
      if (!file) return Response.json({ message: "Not Found" }, { status: 404 });
      if (req.headers.get("Accept")?.includes("raw")) return new Response(file.content);
      const size = new TextEncoder().encode(file.content).length;
      return Response.json({ type: "file", sha: file.sha, size,
        encoding: size > 1024 * 1024 ? "none" : "base64",
        content: size > 1024 * 1024 ? "" : base64(file.content),
        download_url: "https://untrusted.example/content", // Must never be followed.
      });
    }
    const existing = files.get(path);
    if (req.method === "PUT") {
      if (existing && request.body.sha !== existing.sha) return Response.json({}, { status: 409 });
      if (!existing && request.body.sha) return Response.json({}, { status: 422 });
      const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(Uint8Array.from(atob(String(request.body.content)), c => c.charCodeAt(0)));
      const file = await put(path, text);
      return Response.json({ content: { type: "file", sha: file.sha }, commit: { sha: head } }, { status: existing ? 200 : 201 });
    }
    if (req.method === "DELETE") {
      if (!existing || request.body.sha !== existing.sha) return Response.json({}, { status: 409 });
      files.delete(path); commit();
      return Response.json({ content: null, commit: { sha: head } });
    }
    throw new Error("Unexpected method");
  });
  return { files, requests, hooks, fetcher, put };
}
