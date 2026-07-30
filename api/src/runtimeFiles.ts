import fs from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
import type { NovelProject, RuntimeCheckpoint, RuntimeRun } from "./types.js";
import { assertSafeNovelPath, resolveInside } from "./pathSafety.js";
import { createWritingFileSnapshot } from "./fileVersions.js";
import { insertRuntimeCheckpoint, runtimeId, runtimeNow, appendRuntimeEvent } from "./runtimeStore.js";

interface RuntimeWrite {
  relativePath: string;
  content: string;
  failIfExists?: boolean;
}

const projectQueues = new Map<string, Promise<unknown>>();

export class RuntimeWriteConflictError extends Error {
  constructor(
    readonly relativePath: string,
    readonly expectedSha256?: string,
    readonly actualSha256?: string
  ) {
    super(`Runtime write conflict: ${relativePath} changed after checkpoint`);
    this.name = "RuntimeWriteConflictError";
  }
}

function sha256(content: Buffer | string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function checkpointFilePath(checkpointId: string, relativePath: string): string {
  const safeName = relativePath
    .split(/[\\/]+/)
    .filter(Boolean)
    .join("__")
    .replace(/[^a-zA-Z0-9._\-\u4e00-\u9fff]/g, "-")
    .slice(0, 180);
  return `runtime/checkpoints/${checkpointId}/files/${safeName || "file"}`;
}

function runtimeManagedPaths(project: NovelProject, chapterId?: string): string[] {
  const chapters = chapterId
    ? project.chapters.filter((chapter) => chapter.id === chapterId)
    : project.chapters.slice(0, 1);
  return [
    "project.json",
    "story-control/story-control.json",
    "ledger/foreshadowing.json",
    "ledger/continuity.json",
    "ledger/power-progression.json",
    "ledger/character-state.json",
    "ledger/risks.json",
    "knowledge/facts.jsonl",
    "knowledge/triples.jsonl",
    "memory/chapter-index.json",
    "story-graph/storyline.json",
    ...chapters.flatMap((chapter) => [
      chapter.outlinePath,
      chapter.contentPath,
      `dashboard/${chapter.id}.json`,
      `scenes/${chapter.id}.json`,
      `memory/chapter-summaries/${chapter.id}.json`,
      `quality/${chapter.id}.json`
    ])
  ];
}

function governedCanonPath(project: NovelProject, relativePath: string): boolean {
  const safePath = assertSafeNovelPath(relativePath);
  if (safePath === "project.json") return true;
  if (project.chapters.some((chapter) => chapter.contentPath === safePath || chapter.outlinePath === safePath)) return true;
  return safePath === "memory/chapter-index.json" || ["story-control/", "ledger/", "dashboard/", "scenes/", "memory/chapter-summaries/", "quality/", "knowledge/", "story-graph/"]
    .some((prefix) => safePath.startsWith(prefix));
}

function governedProject(project: NovelProject): boolean {
  const outlineVersion = (project as NovelProject & { outlineVersion?: { versionId?: string } }).outlineVersion;
  const migration = (project as NovelProject & { migration?: { state?: string } }).migration;
  return Boolean(outlineVersion?.versionId || migration?.state === "activated");
}

export async function createRuntimeCheckpoint(input: {
  root: string;
  project: NovelProject;
  run?: RuntimeRun;
  chapterId?: string;
  label: string;
}): Promise<RuntimeCheckpoint> {
  const checkpointId = runtimeId("checkpoint");
  const manifest: RuntimeCheckpoint["manifest"] = [];
  const paths = [...new Set(runtimeManagedPaths(input.project, input.chapterId))];
  for (const relativePath of paths) {
    const safePath = assertSafeNovelPath(relativePath);
    const absolutePath = resolveInside(input.root, safePath);
    const targetRelativePath = checkpointFilePath(checkpointId, safePath);
    const target = resolveInside(input.root, targetRelativePath);
    try {
      const stat = await fs.stat(absolutePath);
      const content = await fs.readFile(absolutePath);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, content);
      manifest.push({
        relativePath: safePath,
        checkpointPath: targetRelativePath,
        existed: true,
        size: stat.size,
        sha256: sha256(content)
      });
    } catch (error) {
      if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") {
        manifest.push({
          relativePath: safePath,
          checkpointPath: targetRelativePath,
          existed: false,
          size: 0
        });
        continue;
      }
      throw error;
    }
  }

  const checkpoint = insertRuntimeCheckpoint({
    id: checkpointId,
    projectSlug: input.project.slug,
    runId: input.run?.id,
    chapterId: input.chapterId,
    label: input.label,
    manifest,
    createdAt: runtimeNow()
  });
  appendRuntimeEvent({
    projectSlug: input.project.slug,
    runId: input.run?.id,
    type: "checkpoint",
    stage: "checkpoint_before_run",
    message: `Checkpoint created: ${input.label}`,
    payload: { checkpointId, fileCount: manifest.length }
  });
  return checkpoint;
}

export async function restoreRuntimeCheckpoint(root: string, checkpoint: RuntimeCheckpoint): Promise<void> {
  for (const file of checkpoint.manifest) {
    const target = resolveInside(root, assertSafeNovelPath(file.relativePath));
    if (!file.existed) {
      await fs.rm(target, { force: true });
      continue;
    }
    const source = resolveInside(root, assertSafeNovelPath(file.checkpointPath));
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(source, target);
  }
  appendRuntimeEvent({
    projectSlug: checkpoint.projectSlug,
    runId: checkpoint.runId,
    type: "checkpoint",
    message: `Checkpoint restored: ${checkpoint.label}`,
    payload: { checkpointId: checkpoint.id, fileCount: checkpoint.manifest.length }
  });
}

async function atomicWrite(root: string, relativePath: string, content: string, options: { allowProjectJson?: boolean } = {}): Promise<void> {
  const safePath = assertSafeNovelPath(relativePath);
  if (safePath === "project.json" && !options.allowProjectJson) {
    throw new Error("Runtime write dispatch cannot replace project.json");
  }
  const target = resolveInside(root, safePath);
  const tmp = `${target}.runtime-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.tmp`;
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(tmp, content, "utf8");
  await fs.rename(tmp, target);
}

async function assertCheckpointBaseline(root: string, checkpoint: RuntimeCheckpoint | undefined, relativePath: string): Promise<void> {
  if (!checkpoint) return;
  const safePath = assertSafeNovelPath(relativePath);
  const manifestEntry = checkpoint.manifest.find((file) => file.relativePath === safePath);
  if (!manifestEntry) return;
  const target = resolveInside(root, safePath);
  const current = await fs.readFile(target).catch((error: unknown) => {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null;
    throw error;
  });
  if (!manifestEntry.existed) {
    if (current) {
      throw new RuntimeWriteConflictError(safePath, undefined, sha256(current));
    }
    return;
  }
  const currentHash = current ? sha256(current) : undefined;
  if (currentHash !== manifestEntry.sha256) {
    throw new RuntimeWriteConflictError(safePath, manifestEntry.sha256, currentHash);
  }
}

export async function dispatchRuntimeWrites(input: {
  root: string;
  project: NovelProject;
  run: RuntimeRun;
  writes: RuntimeWrite[];
  reason: string;
  checkpoint?: RuntimeCheckpoint;
  allowProjectJson?: boolean;
}): Promise<void> {
  const governed = governedProject(input.project);
  if (governed && input.writes.some((write) => governedCanonPath(input.project, write.relativePath))) {
    throw new Error("GOVERNED_RUNTIME_CANON_WRITE_REQUIRES_ADOPTION");
  }
  const queueKey = input.project.slug;
  const previous = projectQueues.get(queueKey) || Promise.resolve();
  const next = previous.then(async () => {
    for (const write of input.writes) {
      const safePath = assertSafeNovelPath(write.relativePath);
      await assertCheckpointBaseline(input.root, input.checkpoint, safePath);
      if (write.failIfExists) {
        const exists = await fs
          .access(resolveInside(input.root, safePath))
          .then(() => true)
          .catch(() => false);
        if (exists) {
          throw new RuntimeWriteConflictError(safePath);
        }
      }
      await createWritingFileSnapshot(input.root, input.project, safePath, write.content, {
        source: "runtime",
        reason: input.reason,
        runId: input.run.id
      });
      await atomicWrite(input.root, safePath, write.content, { allowProjectJson: input.allowProjectJson });
      appendRuntimeEvent({
        projectSlug: input.project.slug,
        runId: input.run.id,
        type: "write",
        message: `Runtime wrote ${safePath}`,
        payload: { path: safePath, reason: input.reason, source: "runtime", size: Buffer.byteLength(write.content, "utf8") }
      });
    }
  });
  projectQueues.set(queueKey, next.catch(() => undefined));
  await next;
}
