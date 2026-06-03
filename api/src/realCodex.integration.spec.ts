import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";

const runRealCodex = process.env.RUN_REAL_CODEX === "1";
const describeRealCodex = runRealCodex ? describe : describe.skip;

let server: http.Server | undefined;
let baseUrl = "";
let tempRoot = "";

async function startServer() {
  await new Promise<void>((resolve) => {
    server = createApp().listen(0, "127.0.0.1", resolve);
  });
  const address = server?.address();
  if (!address || typeof address === "string") {
    throw new Error("Unable to resolve test server address");
  }
  baseUrl = `http://127.0.0.1:${address.port}`;
}

async function stopServer() {
  if (!server) return;
  await new Promise<void>((resolve, reject) => {
    server?.close((error) => (error ? reject(error) : resolve()));
  });
  server = undefined;
}

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<{ status: number; data: T }> {
  const response = await fetch(`${baseUrl}${url}`, init);
  const data = (await response.json().catch(() => ({}))) as T;
  return { status: response.status, data };
}

describeRealCodex("real Codex integration", () => {
  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "novel-real-codex-"));
    process.env.NOVELS_ROOT = tempRoot;
    process.env.NOVEL_TEMP_ROOT = path.join(tempRoot, ".tmp");
    await startServer();
  });

  afterEach(async () => {
    await stopServer();
    delete process.env.NOVELS_ROOT;
    delete process.env.NOVEL_TEMP_ROOT;
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it(
    "creates a project, calls the local Codex CLI, parses the result, applies it, and records history",
    async () => {
      const health = await jsonFetch<{ codex: { available: boolean; command: string; version?: string; error?: string } }>("/health");
      expect(health.status).toBe(200);
      expect(health.data.codex.available, health.data.codex.error).toBe(true);

      const created = await jsonFetch<{ project: { slug: string; chapters: Array<{ contentPath: string }> } }>("/api/novel/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Real Codex E2E",
          genre: "fantasy",
          roughIdea: "A careful apprentice advances by paying visible costs instead of sudden power jumps."
        })
      });
      expect(created.status).toBe(201);

      const slug = created.data.project.slug;
      const chapterPath = created.data.project.chapters[0].contentPath;
      const original = "Before the seal, the apprentice breathes once. The stone hums. He does not understand why.";
      const selectedText = "The stone hums.";
      const start = original.indexOf(selectedText);
      const end = start + selectedText.length;
      expect(start).toBeGreaterThanOrEqual(0);

      await jsonFetch(`/api/novel/projects/${slug}/files/${chapterPath}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: original })
      });

      const polished = await jsonFetch<{
        task: {
          id: string;
          status: string;
          error?: string;
          result?: {
            summary: string;
            content: string;
            changes: string[];
            risks: string[];
            questions: string[];
            patches: unknown[];
            parseError?: string;
          };
        };
      }>(`/api/novel/projects/${slug}/selection/polish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chapterId: "chapter-001",
          filePath: chapterPath,
          selectedText,
          beforeText: original.slice(0, start),
          afterText: original.slice(end),
          start,
          end,
          mode: "polish"
        })
      });

      expect(polished.status).toBe(200);
      expect(polished.data.task.status, polished.data.task.error).toBe("success");
      expect(polished.data.task.result?.parseError).toBeUndefined();
      expect(polished.data.task.result?.summary).toBeTruthy();
      expect(polished.data.task.result?.content).toBeTruthy();
      expect(Array.isArray(polished.data.task.result?.changes)).toBe(true);
      expect(Array.isArray(polished.data.task.result?.risks)).toBe(true);
      expect(Array.isArray(polished.data.task.result?.questions)).toBe(true);
      expect(Array.isArray(polished.data.task.result?.patches)).toBe(true);

      const acceptedContent = polished.data.task.result?.content.trim() || selectedText;
      const patched = await jsonFetch<{ applied: number }>(`/api/novel/projects/${slug}/patches`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patches: [
            {
              target: chapterPath,
              mode: "replace-selection",
              content: acceptedContent,
              selection: { start, end }
            }
          ]
        })
      });
      expect(patched.status).toBe(200);
      expect(patched.data.applied).toBe(1);

      const fileAfterPatch = await jsonFetch<{ content: string }>(`/api/novel/projects/${slug}/files/${chapterPath}`);
      expect(fileAfterPatch.data.content).toBe(`${original.slice(0, start)}${acceptedContent}${original.slice(end)}`);

      const history = await fs.readFile(path.join(tempRoot, slug, "tasks", "history.jsonl"), "utf8");
      expect(history).toContain(polished.data.task.id);
      expect(history).toContain("selection.polish");
    },
    240_000
  );
});
