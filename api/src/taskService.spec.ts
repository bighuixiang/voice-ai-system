import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createProjectFiles, createProjectSkeleton } from "./novelProject.js";
import { applyPatch, runNovelTask } from "./taskService.js";
import type { ProcessRunner } from "./codexRunner.js";

let tempRoot = "";

const mockRunner: ProcessRunner = {
  async run() {
    return {
      stdout: "",
      stderr: "",
      exitCode: 0,
      durationMs: 12,
      finalMessage: JSON.stringify({
        summary: "任务完成",
        content: "正文",
        changes: ["生成内容"],
        risks: [],
        questions: [],
        patches: []
      })
    };
  }
};

describe("taskService", () => {
  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "novel-api-"));
    process.env.NOVELS_ROOT = tempRoot;
    const project = createProjectSkeleton({ title: "Demo", roughIdea: "少年修行。" });
    await createProjectFiles(project);
  });

  afterEach(async () => {
    delete process.env.NOVELS_ROOT;
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it("runs a task with a mock Codex runner and records history", async () => {
    const task = await runNovelTask("demo", "outline.generate", {}, mockRunner);
    expect(task.status).toBe("success");
    expect(task.result?.summary).toBe("任务完成");

    const history = await fs.readFile(path.join(tempRoot, "demo", "tasks", "history.jsonl"), "utf8");
    expect(history).toContain("outline.generate");
  });

  it("records a failed Codex exit with the stderr message", async () => {
    const failingRunner: ProcessRunner = {
      async run() {
        return {
          stdout: "",
          stderr: "network unavailable",
          exitCode: 1,
          durationMs: 8,
          finalMessage: JSON.stringify({
            summary: "任务失败",
            content: "",
            changes: [],
            risks: ["Codex 执行失败"],
            questions: [],
            patches: []
          })
        };
      }
    };

    const task = await runNovelTask("demo", "chapter.draft", { chapterId: "chapter-001" }, failingRunner);

    expect(task.status).toBe("error");
    expect(task.error).toContain("network unavailable");

    const history = await fs.readFile(path.join(tempRoot, "demo", "tasks", "history.jsonl"), "utf8");
    expect(history).toContain("chapter.draft");
    expect(history).toContain("network unavailable");
  });

  it("applies replace-file and replace-selection patches inside the project", async () => {
    const root = path.join(tempRoot, "demo");
    await applyPatch(root, {
      target: "outline/chapter-001.md",
      mode: "replace-file",
      content: "# 新章纲\n"
    });
    await applyPatch(root, {
      target: "outline/chapter-001.md",
      mode: "replace-selection",
      content: "精修章纲",
      selection: { start: 2, end: 5 }
    });

    await expect(
      applyPatch(root, {
        target: "../secret.md",
        mode: "replace-file",
        content: "bad"
      })
    ).rejects.toThrow("Unsafe file path");

    const content = await fs.readFile(path.join(root, "outline", "chapter-001.md"), "utf8");
    expect(content).toBe("# 精修章纲\n");
  });
});
