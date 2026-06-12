import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createProjectFiles, createProjectSkeleton } from "./novelProject.js";
import { defaultPlatformAiConfig, writePlatformAiConfig } from "./platformAiConfig.js";
import { applyPatch, cancelNovelTask, markInvocationPatchesAccepted, readNovelTask, readTaskHistory, runNovelTask, startNovelTaskAsync } from "./taskService.js";
import type { ProcessRunner } from "./codexRunner.js";
import type { AiInvocationSession } from "./types.js";

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

async function readInvocations(projectSlug = "demo"): Promise<AiInvocationSession[]> {
  const content = await fs.readFile(path.join(tempRoot, projectSlug, "tasks", "invocations.jsonl"), "utf8");
  return content
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as AiInvocationSession;
      } catch {
        return null;
      }
    })
    .filter((session): session is AiInvocationSession => Boolean(session));
}

describe("taskService", () => {
  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "novel-api-"));
    process.env.NOVELS_ROOT = tempRoot;
    process.env.PLATFORM_ROOT = path.join(tempRoot, "platform");
    process.env.NOVEL_DB_PATH = path.join(tempRoot, "data", "creative-platform.sqlite");
    const project = createProjectSkeleton({ title: "Demo", roughIdea: "少年修行。" });
    await createProjectFiles(project);
  });

  afterEach(async () => {
    delete process.env.NOVELS_ROOT;
    delete process.env.PLATFORM_ROOT;
    delete process.env.NOVEL_DB_PATH;
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it("runs a task with a mock Codex runner and records history", async () => {
    const task = await runNovelTask("demo", "outline.generate", {}, mockRunner);
    expect(task.status).toBe("success");
    expect(task.result?.summary).toBe("任务完成");

    const history = await fs.readFile(path.join(tempRoot, "demo", "tasks", "history.jsonl"), "utf8");
    expect(history).toContain("outline.generate");

    const [invocation] = await readInvocations();
    expect(invocation.taskId).toBe(task.id);
    expect(invocation.taskType).toBe("outline.generate");
    expect(invocation.stageKey).toBe("pipeline.outline.generate");
    expect(invocation.status).toBe("success");
    expect(invocation.agentProfileId).toBe("codex-cli");
    expect(invocation.agentProvider).toBe("codex");
    expect(invocation.promptSnapshot.length).toBeGreaterThan(0);
    expect(invocation.promptSnapshot.contextTitles.length).toBeGreaterThan(0);
    expect(invocation.contextSnapshot.blockCount).toBeGreaterThan(0);
    expect(invocation.promptVersion).toBe("task-template:outline.generate:v2");
    expect(invocation.variablePlan?.payloadKeys).toEqual([]);
    expect(invocation.variablePlan?.contextTierCounts?.T0).toBeGreaterThanOrEqual(1);
    expect(invocation.preCallReview?.status).toBe("pass");
    expect(invocation.contextSnapshot.blocks.some((block) => block.tier === "T0")).toBe(true);
    expect(invocation.adoptionDecision).toBe("not-required");
    expect(invocation.commitResult).toEqual({ historyAppended: true, invocationAppended: true });
  });

  it("starts, polls, and cancels an async task", async () => {
    const cancellableRunner: ProcessRunner = {
      async run(_prompt, _root, _config, options) {
        if (options?.signal?.aborted) {
          return {
            stdout: "",
            stderr: "cancelled before runner started",
            exitCode: null,
            durationMs: 1,
            finalMessage: "",
            cancelled: true
          };
        }
        return new Promise((resolve) => {
          options?.signal?.addEventListener(
            "abort",
            () =>
              resolve({
                stdout: "",
                stderr: "cancelled by test",
                exitCode: null,
                durationMs: 2,
                finalMessage: "",
                cancelled: true
              }),
            { once: true }
          );
        });
      }
    };

    const started = await startNovelTaskAsync("demo", "outline.generate", {}, cancellableRunner);
    const cancelRequested = await cancelNovelTask("demo", started.id);

    expect(started.status).toBe("running");
    expect(cancelRequested).toMatchObject({ id: started.id, status: "running" });

    let finished = await readNovelTask(path.join(tempRoot, "demo"), started.id);
    for (let attempt = 0; attempt < 20 && finished?.status === "running"; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      finished = await readNovelTask(path.join(tempRoot, "demo"), started.id);
    }

    expect(finished).toMatchObject({
      id: started.id,
      status: "cancelled",
      cancelRequestedAt: expect.any(String)
    });
    const [historyTask] = await readTaskHistory(path.join(tempRoot, "demo"));
    expect(historyTask).toMatchObject({ id: started.id, status: "cancelled" });
  });

  it("deduplicates task history by latest task status", async () => {
    const root = path.join(tempRoot, "demo");
    await fs.mkdir(path.join(root, "tasks"), { recursive: true });
    await fs.appendFile(
      path.join(root, "tasks", "history.jsonl"),
      [
        JSON.stringify({
          id: "task-duplicate",
          type: "chapter.draft",
          status: "running",
          projectId: "demo",
          inputSummary: "{}",
          startedAt: "2026-06-11T00:00:00.000Z"
        }),
        JSON.stringify({
          id: "task-duplicate",
          type: "chapter.draft",
          status: "success",
          projectId: "demo",
          inputSummary: "{}",
          outputSummary: "done",
          startedAt: "2026-06-11T00:00:00.000Z",
          finishedAt: "2026-06-11T00:00:02.000Z",
          durationMs: 2000
        }),
        "not-json"
      ].join("\n"),
      "utf8"
    );

    const history = await readTaskHistory(root);

    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ id: "task-duplicate", status: "success" });
  });

  it("marks stale running history as an unrecoverable error", async () => {
    const root = path.join(tempRoot, "demo");
    await fs.mkdir(path.join(root, "tasks"), { recursive: true });
    await fs.appendFile(
      path.join(root, "tasks", "history.jsonl"),
      `${JSON.stringify({
        id: "task-stale-running",
        type: "chapter.draft",
        status: "running",
        projectId: "demo",
        inputSummary: "{}",
        startedAt: "2026-06-11T00:00:00.000Z"
      })}\n`,
      "utf8"
    );

    const history = await readTaskHistory(root);
    const persisted = await fs.readFile(path.join(root, "tasks", "history.jsonl"), "utf8");

    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      id: "task-stale-running",
      status: "error",
      outputSummary: "AI task stopped before completion."
    });
    expect(history[0].error).toContain("previous API process");
    expect(persisted).toContain('"status":"running"');
    expect(persisted).toContain('"status":"error"');
  });

  it("records proposed patch targets in the AI invocation audit log", async () => {
    const patchRunner: ProcessRunner = {
      async run() {
        return {
          stdout: "",
          stderr: "",
          exitCode: 0,
          durationMs: 15,
          finalMessage: JSON.stringify({
            summary: "patch ready",
            content: "",
            changes: ["updated outline"],
            risks: [],
            questions: [],
            patches: [
              {
                target: "outline/chapter-001.md",
                mode: "replace-file",
                content: "# patched\n"
              }
            ]
          })
        };
      }
    };

    const task = await runNovelTask("demo", "chapter.plan", { chapterId: "chapter-001" }, patchRunner);

    expect(task.status).toBe("success");
    const [invocation] = await readInvocations();
    expect(invocation.adoptionDecision).toBe("pending");
    expect(invocation.proposedPatchTargets).toEqual(["outline/chapter-001.md"]);
    expect(invocation.acceptedPatchTargets).toEqual([]);
  });

  it("marks a proposed invocation patch as accepted after author confirmation", async () => {
    const patchRunner: ProcessRunner = {
      async run() {
        return {
          stdout: "",
          stderr: "",
          exitCode: 0,
          durationMs: 15,
          finalMessage: JSON.stringify({
            summary: "patch ready",
            content: "",
            changes: ["updated outline"],
            risks: [],
            questions: [],
            patches: [
              {
                target: "outline/chapter-001.md",
                mode: "replace-file",
                content: "# patched\n"
              }
            ]
          })
        };
      }
    };

    const task = await runNovelTask("demo", "chapter.plan", { chapterId: "chapter-001" }, patchRunner);
    await fs.appendFile(path.join(tempRoot, "demo", "tasks", "invocations.jsonl"), "not-json\n", "utf8");

    const update = await markInvocationPatchesAccepted(path.join(tempRoot, "demo"), task.id, ["outline/chapter-001.md"]);
    const [invocation] = await readInvocations();
    const raw = await fs.readFile(path.join(tempRoot, "demo", "tasks", "invocations.jsonl"), "utf8");

    expect(update.updated).toBe(true);
    expect(update.invocationId).toBe(invocation.id);
    expect(invocation.adoptionDecision).toBe("accepted");
    expect(invocation.acceptedPatchTargets).toEqual(["outline/chapter-001.md"]);
    expect(invocation.adoptionUpdatedAt).toBeTruthy();
    expect(raw).toContain("not-json");
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

  it("runs a task through the global novel AI scenario profile", async () => {
    const projectPath = path.join(tempRoot, "demo", "project.json");
    const project = JSON.parse(await fs.readFile(projectPath, "utf8"));
    project.codex.command = "malicious-command";
    project.ai = { profileId: "codex-cli", modelId: "gpt-5" };
    await fs.writeFile(projectPath, JSON.stringify(project, null, 2), "utf8");
    await writePlatformAiConfig({
      ...defaultPlatformAiConfig(),
      scenarios: {
        ...defaultPlatformAiConfig().scenarios,
        novel: { profileId: "claude-code", modelId: "sonnet" }
      }
    });

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

    const [invocation] = await readInvocations();
    expect(invocation.status).toBe("error");
    expect(invocation.stageKey).toBe("pipeline.chapter.prose");
    expect(invocation.attempt.exitCode).toBe(1);
    expect(invocation.attempt.error).toContain("network unavailable");
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
