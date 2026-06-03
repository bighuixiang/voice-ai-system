import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";

let server: http.Server;
let baseUrl = "";
let tempRoot = "";

async function startServer() {
  await new Promise<void>((resolve) => {
    server = createApp().listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Unable to resolve test server address");
  }
  baseUrl = `http://127.0.0.1:${address.port}`;
}

async function stopServer() {
  if (!server) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<{ status: number; data: T }> {
  const response = await fetch(`${baseUrl}${url}`, init);
  const data = (await response.json().catch(() => ({}))) as T;
  return { status: response.status, data };
}

describe("novel API routes", () => {
  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "novel-api-routes-"));
    process.env.NOVELS_ROOT = tempRoot;
    await startServer();
  });

  afterEach(async () => {
    await stopServer();
    delete process.env.NOVELS_ROOT;
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it("creates, lists, reads, and saves a novel project file", async () => {
    const created = await jsonFetch<{ project: { slug: string; chapters: Array<{ contentPath: string }> } }>("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Demo Novel",
        genre: "fantasy",
        roughIdea: "A cautious apprentice finds a sealed room."
      })
    });

    expect(created.status).toBe(201);
    expect(created.data.project.slug).toBe("demo-novel");

    const listed = await jsonFetch<{ projects: Array<{ slug: string }> }>("/api/novel/projects");
    expect(listed.data.projects.map((project) => project.slug)).toContain("demo-novel");

    const filePath = created.data.project.chapters[0].contentPath;
    const readBefore = await jsonFetch<{ content: string }>(`/api/novel/projects/demo-novel/files/${filePath}`);
    expect(readBefore.data.content.length).toBeGreaterThan(0);

    const saved = await jsonFetch<{ saved: boolean }>(`/api/novel/projects/demo-novel/files/${filePath}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "manual draft" })
    });
    expect(saved.data.saved).toBe(true);

    const readAfter = await jsonFetch<{ content: string }>(`/api/novel/projects/demo-novel/files/${filePath}`);
    expect(readAfter.data.content).toBe("manual draft");
  });

  it("applies replace-selection patches only inside the project", async () => {
    await jsonFetch("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Patch Demo", roughIdea: "Patch a local draft." })
    });
    await jsonFetch("/api/novel/projects/patch-demo/files/chapters/chapter-001.md", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "before plain line after" })
    });

    const patched = await jsonFetch<{ applied: number }>("/api/novel/projects/patch-demo/patches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patches: [
          {
            target: "chapters/chapter-001.md",
            mode: "replace-selection",
            content: "sharper line",
            selection: { start: 7, end: 17 }
          }
        ]
      })
    });
    const readAfter = await jsonFetch<{ content: string }>("/api/novel/projects/patch-demo/files/chapters/chapter-001.md");

    expect(patched.data.applied).toBe(1);
    expect(readAfter.data.content).toBe("before sharper line after");
  });

  it("rejects unsupported task types before invoking Codex", async () => {
    await jsonFetch("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Task Demo", roughIdea: "Task validation." })
    });

    const response = await jsonFetch<{ error: string }>("/api/novel/projects/task-demo/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "unknown.task", payload: {} })
    });

    expect(response.status).toBe(400);
    expect(response.data.error).toContain("Unsupported task type");
  });
});
