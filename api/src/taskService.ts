import fs from "node:fs/promises";
import path from "node:path";
import type { AiInvocationSession, CodexTaskType, CodexTaskResult, NovelFilePatch, NovelTask } from "./types.js";
import { resolveAgentProfile } from "./agentConfig.js";
import { readPlatformAiConfig } from "./platformAiConfig.js";
import { buildTaskPrompt } from "./taskTemplates.js";
import { parseCodexResult } from "./resultParser.js";
import { assembleContext } from "./contextAssembler.js";
import { readProject, projectRoot, writeProject } from "./novelProject.js";
import { assertSafeNovelPath, resolveInside } from "./pathSafety.js";
import { AgentProcessRunner, type ProcessRunner } from "./codexRunner.js";
import { stageKeyForTask } from "./aiStages.js";

function taskId(): string {
  return `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function invocationId(): string {
  return `invocation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function appendHistory(root: string, task: NovelTask): Promise<void> {
  const historyPath = resolveInside(root, "tasks/history.jsonl");
  await fs.mkdir(path.dirname(historyPath), { recursive: true });
  await fs.appendFile(historyPath, `${JSON.stringify(task)}\n`, "utf8");
}

async function appendInvocationSession(root: string, session: AiInvocationSession): Promise<void> {
  const invocationPath = resolveInside(root, "tasks/invocations.jsonl");
  await fs.mkdir(path.dirname(invocationPath), { recursive: true });
  await fs.appendFile(invocationPath, `${JSON.stringify(session)}\n`, "utf8");
}

async function readInvocationLines(root: string): Promise<string[]> {
  const invocationPath = resolveInside(root, "tasks/invocations.jsonl");
  try {
    const content = await fs.readFile(invocationPath, "utf8");
    return content.split(/\r?\n/).filter(Boolean);
  } catch {
    return [];
  }
}

export async function readInvocationSessions(root: string): Promise<AiInvocationSession[]> {
  return (await readInvocationLines(root))
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as AiInvocationSession;
      } catch {
        return null;
      }
    })
    .filter((session): session is AiInvocationSession => Boolean(session?.id && session.taskId && session.taskType))
    .sort((left, right) => Date.parse(right.attempt.startedAt || right.createdAt) - Date.parse(left.attempt.startedAt || left.createdAt));
}

export async function markInvocationPatchesAccepted(
  root: string,
  taskId: string,
  acceptedPatchTargets: string[]
): Promise<{ updated: boolean; invocationId?: string }> {
  const invocationPath = resolveInside(root, "tasks/invocations.jsonl");
  const lines = await readInvocationLines(root);
  if (!lines.length) return { updated: false };

  let updated = false;
  let invocationId = "";
  const updatedAt = new Date().toISOString();
  const nextLines = lines.map((line) => {
    try {
      const session = JSON.parse(line) as AiInvocationSession;
      if (!session?.id || session.taskId !== taskId) {
        return line;
      }
      updated = true;
      invocationId = session.id;
      return JSON.stringify({
        ...session,
        adoptionDecision: acceptedPatchTargets.length ? "accepted" : session.adoptionDecision,
        adoptionUpdatedAt: updatedAt,
        acceptedPatchTargets,
        updatedAt
      } satisfies AiInvocationSession);
    } catch {
      return line;
    }
  });

  if (!updated) return { updated: false };
  await fs.mkdir(path.dirname(invocationPath), { recursive: true });
  await fs.writeFile(invocationPath, `${nextLines.join("\n")}\n`, "utf8");
  return { updated: true, invocationId };
}

function previewText(input: string, limit = 240): string {
  const normalized = input.replace(/\s+/g, " ").trim();
  return normalized.length > limit ? `${normalized.slice(0, limit)}...` : normalized;
}

function promptSnapshot(prompt: string, contextBlocks: Array<{ title: string; content: string }>) {
  return {
    length: prompt.length,
    preview: previewText(prompt),
    contextTitles: contextBlocks.map((block) => block.title)
  };
}

function contextSnapshot(contextBlocks: Array<{ title: string; content: string }>) {
  return {
    blockCount: contextBlocks.length,
    totalChars: contextBlocks.reduce((total, block) => total + block.content.length, 0),
    blocks: contextBlocks.map((block) => ({
      title: block.title,
      length: block.content.length
    }))
  };
}

function createInvocationSession(task: NovelTask): AiInvocationSession {
  return {
    id: invocationId(),
    taskId: task.id,
    projectId: task.projectId,
    taskType: task.type,
    stageKey: stageKeyForTask(task.type),
    status: "running",
    promptSnapshot: {
      length: 0,
      preview: "",
      contextTitles: []
    },
    contextSnapshot: {
      blockCount: 0,
      totalChars: 0,
      blocks: []
    },
    attempt: {
      index: 1,
      startedAt: task.startedAt
    },
    adoptionDecision: "pending",
    proposedPatchTargets: [],
    acceptedPatchTargets: [],
    commitResult: {
      historyAppended: false,
      invocationAppended: false
    },
    createdAt: task.startedAt,
    updatedAt: task.startedAt
  };
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
  runner: ProcessRunner = new AgentProcessRunner()
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
  const invocation = createInvocationSession(task);

  try {
    const contextBlocks = await assembleContext(type, root, project, payload);
    const prompt = buildTaskPrompt(type, {
      projectTitle: project.title,
      target: String(payload.chapterId || payload.filePath || ""),
      authorInput: String(payload.roughIdea || payload.feedback || ""),
      contextBlocks,
      payload
    });
    invocation.promptSnapshot = promptSnapshot(prompt, contextBlocks);
    invocation.contextSnapshot = contextSnapshot(contextBlocks);
    const platformAiConfig = await readPlatformAiConfig();
    const novelAiConfig = platformAiConfig.scenarios.novel;
    const profileId = typeof payload.agentProfileId === "string" ? payload.agentProfileId : novelAiConfig.profileId || project.ai?.profileId;
    const payloadModel = typeof payload.modelId === "string" ? payload.modelId : undefined;
    const config = resolveAgentProfile({
      profileId,
      modelId: payloadModel || novelAiConfig.modelId || project.ai?.modelId || project.codex.model
    });
    invocation.agentProfileId = config.id;
    invocation.agentProvider = config.provider;
    invocation.modelId = config.model;
    const output = await runner.run(prompt, root, config);
    const result = parseCodexResult(output.finalMessage);
    task.status = output.exitCode === 0 ? "success" : "error";
    task.result = result;
    task.outputSummary = result.summary;
    task.error = output.exitCode === 0 ? undefined : output.stderr || `${config.label} exited with ${output.exitCode}`;
    task.durationMs = output.durationMs;
    invocation.attempt.exitCode = output.exitCode;
    invocation.proposedPatchTargets = result.patches.map((patch) => patch.target);
    invocation.adoptionDecision = result.patches.length ? "pending" : "not-required";
  } catch (error) {
    task.status = "error";
    task.error = error instanceof Error ? error.message : String(error);
    task.durationMs = Date.now() - started;
  } finally {
    task.finishedAt = new Date().toISOString();
    invocation.status = task.status;
    invocation.updatedAt = task.finishedAt;
    invocation.attempt.finishedAt = task.finishedAt;
    invocation.attempt.durationMs = task.durationMs;
    if (task.error) {
      invocation.attempt.error = task.error;
    }
    await appendHistory(root, task);
    invocation.commitResult.historyAppended = true;
    invocation.commitResult.invocationAppended = true;
    await appendInvocationSession(root, invocation);
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
