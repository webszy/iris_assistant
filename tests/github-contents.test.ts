import { describe, expect, it } from "vitest";
import { GitHubContentsProvider } from "../src/providers/github-contents";
import { MAX_MARKDOWN_CONTENT_BYTES } from "../src/lib/markdown-content";
import { githubFixture, githubTestConfiguration, gitBlob } from "./github-content-fixture";

const path = "projects/project-id/notes/中文 #?.md";
function fixture() {
  const github = githubFixture();
  return { github, provider: new GitHubContentsProvider(githubTestConfiguration, github.fetcher) };
}

describe("GitHub Contents adapter", () => {
  it.each(["", "\uFEFF# 中文 😀\r\n\r\n", "x".repeat(1024 * 1024 + 1), "x".repeat(MAX_MARKDOWN_CONTENT_BYTES)])(
    "reads exact UTF-8 contents across inline/raw limits (%#)", async content => {
      const { github, provider } = fixture();
      const file = await github.put(path, content);
      expect(await provider.read({ path })).toEqual({ content, revision: file.sha, sizeBytes: new TextEncoder().encode(content).length });
      expect(github.requests.every(r => r.url.hostname === "api.github.com")).toBe(true);
      expect(github.requests[0]?.url.pathname).toContain("memory%2Ftest");
      expect(github.requests.every(r => r.headers.get("Authorization") === "Bearer fake-github-secret")).toBe(true);
    },
  );

  it("pins metadata/raw to one commit even when the branch changes between requests", async () => {
    const { github, provider } = fixture();
    const content = "a".repeat(1024 * 1024 + 1);
    const original = await github.put(path, content);
    github.hooks.intercept = async request => {
      if (request.headers.get("Accept")?.includes("raw")) await github.put(path, "a newer value");
      return undefined;
    };
    expect(await provider.read({ path })).toMatchObject({ content, revision: original.sha });
    const refs = github.requests.filter(r => r.url.pathname.includes("/contents/")).map(r => r.url.searchParams.get("ref"));
    expect(new Set(refs).size).toBe(1);
  });

  it("rejects raw bytes that do not match metadata revision", async () => {
    const { github, provider } = fixture();
    await github.put(path, "a".repeat(1024 * 1024 + 1));
    github.hooks.intercept = async request => request.headers.get("Accept")?.includes("raw") ? new Response("wrong") : undefined;
    await expect(provider.read({ path })).rejects.toMatchObject({ code: "CONTENT_PROVIDER_ERROR" });
  });

  it("rejects oversized metadata without requesting raw content", async () => {
    const { github, provider } = fixture();
    github.hooks.intercept = async request => request.url.pathname.includes("/contents/")
      ? Response.json({ type: "file", size: MAX_MARKDOWN_CONTENT_BYTES + 1, sha: "a".repeat(40), encoding: "none" }) : undefined;
    await expect(provider.read({ path })).rejects.toMatchObject({ code: "CONTENT_TOO_LARGE" });
    expect(github.requests).toHaveLength(2);
  });

  it("bounds the actual raw stream even if metadata understates the size", async () => {
    const { github, provider } = fixture();
    await github.put(path, "a".repeat(1024 * 1024 + 1));
    github.hooks.intercept = async request => request.headers.get("Accept")?.includes("raw")
      ? new Response("a".repeat(MAX_MARKDOWN_CONTENT_BYTES + 1)) : undefined;
    await expect(provider.read({ path })).rejects.toMatchObject({ code: "CONTENT_TOO_LARGE" });
  });

  it.each([401, 403, 404, 429, 500, 503])("repository/branch failure %s is not CONTENT_NOT_FOUND", async status => {
    const { github, provider } = fixture();
    github.hooks.intercept = async () => Response.json({ message: "private details" }, { status });
    await expect(provider.read({ path })).rejects.toMatchObject({ code: "CONTENT_PROVIDER_ERROR", status });
  });

  it("a missing path after resolving the branch is CONTENT_NOT_FOUND", async () => {
    const { provider } = fixture();
    await expect(provider.read({ path })).rejects.toMatchObject({ code: "CONTENT_NOT_FOUND" });
    await expect(provider.update({ path }, "new", "a".repeat(40), "Update")).rejects.toMatchObject({ code: "CONTENT_NOT_FOUND" });
  });

  it("CREATE treats directories at the target path as existing and never issues PUT", async () => {
    const { github, provider } = fixture();
    github.hooks.intercept = async request => request.url.pathname.includes("/contents/")
      ? Response.json({ type: "dir", entries: [] }) : undefined;
    await expect(provider.create({ path }, "new", "Add")).rejects.toMatchObject({ code: "CONTENT_ALREADY_EXISTS" });
    expect(github.requests.some(r => r.method === "PUT")).toBe(false);
  });

  it("malformed JSON is a provider failure with no raw response disclosure", async () => {
    const { github, provider } = fixture();
    github.hooks.intercept = async () => new Response("private malformed response");
    await expect(provider.read({ path })).rejects.toMatchObject({
      code: "CONTENT_PROVIDER_ERROR", message: "Content provider unavailable or misconfigured.",
    });
  });

  it.each([
    { type: "dir", entries: [] },
    { type: "symlink", sha: "a".repeat(40), size: 1, target: "../../secret.md" },
    { type: "file", sha: "a".repeat(40), size: 1, target: "../../secret.md" },
    { type: "file", sha: "a".repeat(40), size: 1, submodule_git_url: "https://example.test" },
    { type: "file", sha: "broken", size: 1 },
    { type: "file", sha: "a".repeat(40), size: 1, encoding: "base64", content: "!!!!" },
  ])("rejects unsupported or malformed metadata (%#)", async data => {
    const { github, provider } = fixture();
    github.hooks.intercept = async request => request.url.pathname.includes("/contents/") ? Response.json(data) : undefined;
    await expect(provider.read({ path })).rejects.toMatchObject({ code: "CONTENT_PROVIDER_ERROR" });
  });

  it("does not follow raw download URLs or redirects", async () => {
    const { github, provider } = fixture();
    github.hooks.intercept = async request => request.url.pathname.includes("/contents/")
      ? new Response(null, { status: 302, headers: { Location: "https://evil.test" } }) : undefined;
    await expect(provider.read({ path })).rejects.toMatchObject({ code: "CONTENT_PROVIDER_ERROR" });
    expect(github.requests).toHaveLength(2);
    expect(github.fetcher.mock.calls.every(([, options]) => options?.redirect === "manual")).toBe(true);
  });

  it("creates without SHA; updates and rolls back with the precise revision and configured branch", async () => {
    const { github, provider } = fixture();
    const created = await provider.create({ path }, "# 原文\r\n", "Add");
    const updated = await provider.update({ path }, "# Updated", created.revision, "Update");
    await provider.delete({ path }, updated.revision, "Rollback failed Iris Resource creation");
    const writes = github.requests.filter(r => r.method !== "GET");
    expect(writes[0]?.body).not.toHaveProperty("sha");
    expect(writes[1]?.body.sha).toBe(created.revision);
    expect(writes[2]?.body.sha).toBe(updated.revision);
    expect(writes.every(r => r.body.branch === "memory/test")).toBe(true);
    expect(updated.revision).toBe(await gitBlob("# Updated"));
    expect(github.files.has(path)).toBe(false);
  });

  it("never overwrites on duplicate CREATE or a CREATE race", async () => {
    const { github, provider } = fixture();
    await github.put(path, "existing");
    await expect(provider.create({ path }, "wrong", "Add")).rejects.toMatchObject({ code: "CONTENT_ALREADY_EXISTS" });
    expect(github.requests.some(r => r.method === "PUT")).toBe(false);
    const another = "projects/project-id/race.md";
    github.hooks.intercept = async request => {
      if (request.method === "PUT") await github.put(another, "winner");
      return undefined;
    };
    await expect(provider.create({ path: another }, "loser", "Add")).rejects.toMatchObject({ code: "CONTENT_ALREADY_EXISTS" });
    expect(github.files.get(another)?.content).toBe("winner");
  });

  it("stale revision is rejected even when submitted text equals the latest content", async () => {
    const { github, provider } = fixture();
    const old = await github.put(path, "old");
    await github.put(path, "latest");
    await expect(provider.update({ path }, "latest", old.sha, "Update")).rejects.toMatchObject({ code: "CONTENT_CONFLICT" });
    expect(github.requests.some(r => r.method === "PUT")).toBe(false);
  });

  it("GitHub detects an update racing after metadata read, with no retry or overwrite", async () => {
    const { github, provider } = fixture();
    const old = await github.put(path, "old");
    github.hooks.intercept = async request => {
      if (request.method === "PUT") await github.put(path, "concurrent winner");
      return undefined;
    };
    await expect(provider.update({ path }, "loser", old.sha, "Update")).rejects.toMatchObject({ code: "CONTENT_CONFLICT" });
    expect(github.files.get(path)?.content).toBe("concurrent winner");
    expect(github.requests.filter(r => r.method === "PUT")).toHaveLength(1);
  });

  it("same text may keep its revision and A→B→A uses the original content revision", async () => {
    const { github, provider } = fixture();
    const a = await github.put(path, "A");
    expect((await provider.update({ path }, "A", a.sha, "Update")).revision).toBe(a.sha);
    await github.put(path, "B"); await github.put(path, "A");
    expect((await provider.update({ path }, "C", a.sha, "Update")).revision).toBe(await gitBlob("C"));
  });

  it.each(["network", "malformed", "server"])("CREATE %s result is unknown and is not retried", async failure => {
    const { github, provider } = fixture();
    github.hooks.intercept = async request => {
      if (request.method !== "PUT") return undefined;
      if (failure === "network") throw new Error("timeout private details");
      return failure === "server" ? new Response("private details", { status: 503 }) : new Response("{}", { status: 201 });
    };
    await expect(provider.create({ path }, "new", "Add")).rejects.toMatchObject({ code: "CONTENT_PROVIDER_ERROR", outcome: "unknown" });
    expect(github.requests.filter(r => r.method !== "GET")).toHaveLength(1);
  });
});
