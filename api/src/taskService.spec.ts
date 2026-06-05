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
    process.env.NOVEL_DB_PATH = path.join(tempRoot, "data", "creative-platform.sqlite");
    const project = createProjectSkeleton({ title: "Demo", roughIdea: "少年修行。" });
    await createProjectFiles(project);
  });

  afterEach(async () => {
    delete process.env.NOVELS_ROOT;
    delete process.env.NOVEL_DB_PATH;
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it("runs a task with a mock Codex runner and records history", async () => {
    const task = await runNovelTask("demo", "outline.generate", {}, mockRunner);
    expect(task.status).toBe("success");
    expect(task.result?.summary).toBe("任务完成");

    const history = await fs.readFile(path.join(tempRoot, "demo", "tasks", "history.jsonl"), "utf8");
    expect(history).toContain("outline.generate");
  });

  it("ignores Codex command values stored in project files", async () => {
    const projectPath = path.join(tempRoot, "demo", "project.json");
    const project = JSON.parse(await fs.readFile(projectPath, "utf8"));
    project.codex.command = "malicious-command";
    project.codex.model = "test-model";
    project.ai = { profileId: "unknown-profile", modelId: "test-model" };
    await fs.writeFile(projectPath, JSON.stringify(project, null, 2), "utf8");

    const originalCommand = process.env.CODEX_COMMAND;
    delete process.env.CODEX_COMMAND;
    let commandFromRunner = "";
    let modelFromRunner = "";
    const capturingRunner: ProcessRunner = {
      async run(_prompt, _root, config) {
        commandFromRunner = config.command;
        modelFromRunner = config.model || "";
        return {
          stdout: "",
          stderr: "",
          exitCode: 0,
          durationMs: 12,
          finalMessage: JSON.stringify({
            summary: "task done",
            content: "",
            changes: [],
            risks: [],
            questions: [],
            patches: []
          })
        };
      }
    };

    try {
      await runNovelTask("demo", "outline.generate", {}, capturingRunner);
    } finally {
      if (originalCommand === undefined) {
        delete process.env.CODEX_COMMAND;
      } else {
        process.env.CODEX_COMMAND = originalCommand;
      }
    }

    expect(commandFromRunner).toBe("codex");
    expect(modelFromRunner).toBe("test-model");
  });

  it("runs a task through the configured trusted AI agent profile", async () => {
    const projectPath = path.join(tempRoot, "demo", "project.json");
    const project = JSON.parse(await fs.readFile(projectPath, "utf8"));
    project.codex.command = "malicious-command";
    project.ai = { profileId: "claude-code", modelId: "sonnet" };
    await fs.writeFile(projectPath, JSON.stringify(project, null, 2), "utf8");

    let commandFromRunner = "";
    let providerFromRunner = "";
    let modelFromRunner = "";
    const capturingRunner: ProcessRunner = {
      async run(_prompt, _root, config) {
        commandFromRunner = config.command;
        providerFromRunner = config.provider;
        modelFromRunner = config.model || "";
        return {
          stdout: "",
          stderr: "",
          exitCode: 0,
          durationMs: 12,
          finalMessage: JSON.stringify({
            summary: "task done",
            content: "",
            changes: [],
            risks: [],
            questions: [],
            patches: []
          })
        };
      }
    };

    await runNovelTask("demo", "outline.generate", {}, capturingRunner);

    expect(commandFromRunner).toBe(process.env.CLAUDE_CODE_COMMAND || "claude");
    expect(providerFromRunner).toBe("claude-code");
    expect(modelFromRunner).toBe("sonnet");
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
    await expect(
      applyPatch(root, {
        target: "project.json",
        mode: "replace-file",
        content: "{}"
      })
    ).rejects.toThrow("Protected project metadata");

    const content = await fs.readFile(path.join(root, "outline", "chapter-001.md"), "utf8");
    expect(content).toBe("# 精修章纲\n");
  });
});
