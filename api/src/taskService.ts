import fs from "node:fs/promises";
import path from "node:path";
import type { CodexTaskType, CodexTaskResult, NovelFilePatch, NovelTask } from "./types.js";
import { resolveCodexCommand } from "./codexConfig.js";
import { buildTaskPrompt } from "./taskTemplates.js";
import { parseCodexResult } from "./resultParser.js";
import { assembleContext } from "./contextAssembler.js";
import { readProject, projectRoot, writeProject } from "./novelProject.js";
import { assertSafeNovelPath, resolveInside } from "./pathSafety.js";
import { CodexProcessRunner, type ProcessRunner } from "./codexRunner.js";

function taskId(): string {
  return `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function appendHistory(root: string, task: NovelTask): Promise<void> {
  const historyPath = resolveInside(root, "tasks/history.jsonl");
  await fs.mkdir(path.dirname(historyPath), { recursive: true });
  await fs.appendFile(historyPath, `${JSON.stringify(task)}\n`, "utf8");
}

export async function applyPatch(root: string, patch: NovelFilePatch): Promise<void> {
  const safeTarget = assertSafeNovelPath(patch.target);
  if (safeTarget === "project.json") {
    throw new Error("Protected project metadata cannot be patched");
  }

  const target = resolveInside(root, safeTarget);
  if (patch.mode === "replace-file") {
    await fs.writeFile(target, patch.content, "utf8");
    return;
  }

  if (patch.mode === "replace-selection") {
    if (!patch.selection) {
      throw new Error("replace-selection patch requires selection");
    }
    const original = await fs.readFile(target, "utf8");
    const next = `${original.slice(0, patch.selection.start)}${patch.content}${original.slice(patch.selection.end)}`;
    await fs.writeFile(target, next, "utf8");
  }
}

export async function runNovelTask(
  projectId: string,
  type: CodexTaskType,
  payload: Record<string, unknown>,
  runner: ProcessRunner = new CodexProcessRunner()
): Promise<NovelTask> {
  const project = await readProject(projectId);
  const root = projectRoot(project.slug);
  const started = Date.now();
  const task: NovelTask = {
    id: taskId(),
    type,
    status: "running",
    projectId: project.slug,
    inputSummary: JSON.stringify(payload).slice(0, 500),
    startedAt: new Date(started).toISOString()
  };

  try {
    const contextBlocks = await assembleContext(type, root, project, payload);
    const prompt = buildTaskPrompt(type, {
      projectTitle: project.title,
      target: String(payload.chapterId || payload.filePath || ""),
      authorInput: String(payload.roughIdea || payload.feedback || ""),
      contextBlocks,
      payload
    });
    const config = resolveCodexCommand({ model: project.codex.model });
    const output = await runner.run(prompt, root, config);
    const result = parseCodexResult(output.finalMessage);
    task.status = output.exitCode === 0 ? "success" : "error";
    task.result = result;
    task.outputSummary = result.summary;
    task.error = output.exitCode === 0 ? undefined : output.stderr || `Codex exited with ${output.exitCode}`;
    task.durationMs = output.durationMs;
  } catch (error) {
    task.status = "error";
    task.error = error instanceof Error ? error.message : String(error);
    task.durationMs = Date.now() - started;
  } finally {
    task.finishedAt = new Date().toISOString();
    await appendHistory(root, task);
  }

  project.updatedAt = new Date().toISOString();
  await writeProject(project);
  return task;
}

export function fallbackProjectCreateResult(title: string): CodexTaskResult {
  return {
    summary: "已创建基础小说项目骨架",
    content: "项目已创建。可以继续生成故事圣经、大纲和第一章章纲。",
    changes: [`创建项目：${title}`],
    risks: ["尚未调用 Codex 生成完整设定，请在工作台中继续生成大纲或补充故事圣经。"],
    questions: [],
    patches: []
  };
}
