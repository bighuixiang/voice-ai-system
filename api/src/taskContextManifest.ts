import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import type { CodexTaskType } from "./types.js";
import type { TaskContextPlan, TaskContextPlanBlock } from "./taskContextPlan.js";
import { sourceVersionFor } from "./taskContextSources.js";
import type { ContextSourceResult } from "./contextSourceGate.js";
import type { RetrievalEligibility } from "./taskContextRetrieval.js";

export interface TaskContextManifestBlock {
  id: string;
  title: string;
  tier?: TaskContextPlanBlock["tier"];
  sourceRefs: string[];
  sourceVersion: string;
  sourceHash: string;
  originalTokens: number;
  finalTokens: number;
  compression: TaskContextPlanBlock["compression"];
  permission: "model" | "blocked";
  selected: boolean;
  truncated: boolean;
  exclusionReason?: string;
}

export interface TaskContextManifest {
  schemaVersion: "task-context-manifest.v1";
  manifestId: string;
  projectSlug: string;
  taskId: string;
  taskType: CodexTaskType;
  sourceFingerprint: string;
  blocks: TaskContextManifestBlock[];
  status: "pass" | "block";
  sourceGate?: ContextSourceResult;
  retrievalEligibility?: RetrievalEligibility;
  warnings: string[];
  createdAt: string;
  fingerprint: string;
}

const hash = (value: unknown): string => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const contentHash = (content: string): string => crypto.createHash("sha256").update(content, "utf8").digest("hex");

function blockId(title: string, index: number): string {
  const slug = title.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "") || "block";
  return `context-block-${index + 1}-${slug}`;
}

function isBudgetLog(block: { title: string; content: string }): boolean {
  try {
    return (JSON.parse(block.content) as { version?: string }).version === "context-budget:v2";
  } catch {
    return false;
  }
}

export function buildTaskContextManifest(input: {
  projectSlug: string;
  taskId: string;
  taskType: CodexTaskType;
  blocks: Array<{ title: string; content: string }>;
  plan: TaskContextPlan;
  sourceRefs?: Record<string, string[]>;
  sourceVersions?: Record<string, string>;
  excludedBlocks?: Record<string, string>;
  statusOverride?: "pass" | "block";
  sourceGate?: ContextSourceResult;
  retrievalEligibility?: RetrievalEligibility;
  createdAt?: string;
}): TaskContextManifest {
  const warnings = [...input.plan.warnings];
  const planByTitle = new Map(input.plan.blocks.map((block) => [block.title, block]));
  const blocks = input.blocks
    .filter((block) => !isBudgetLog(block))
    .map((block, index) => {
      const planned = planByTitle.get(block.title);
      const refs = input.sourceRefs?.[block.title]?.filter((ref) => ref.trim()) || [];
      if (!refs.length) {
        warnings.push("SOURCE_REF_FALLBACK_USED");
        refs.push(`context://block/${block.title.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "") || "unknown"}`);
      }
      const sourceHash = contentHash(block.content);
      const exclusionReason = input.excludedBlocks?.[block.title];
      if (exclusionReason) warnings.push(exclusionReason);
      return {
        id: blockId(block.title, index),
        title: block.title,
        tier: planned?.tier,
        sourceRefs: refs,
        sourceVersion: input.sourceVersions?.[block.title] || sourceHash,
        sourceHash,
        originalTokens: planned?.originalTokens ?? Math.ceil(block.content.length / 4),
        finalTokens: planned?.finalTokens ?? Math.ceil(block.content.length / 4),
        compression: planned?.compression ?? "none",
        permission: exclusionReason ? "blocked" as const : "model" as const,
        selected: !exclusionReason,
        truncated: planned?.truncated ?? false,
        ...(exclusionReason ? { exclusionReason } : {})
      } satisfies TaskContextManifestBlock;
    });
  const t0Truncated = blocks.some((block) => block.selected && block.tier === "T0" && block.truncated);
  if (t0Truncated) warnings.push("T0_TRUNCATION_BLOCKED");
  const planNotReady = input.plan.status !== "pass";
  if (planNotReady) warnings.push("CONTEXT_PLAN_NOT_READY");
  const sourceFingerprint = hash({ schemaVersion: "task-context-manifest.v1", projectSlug: input.projectSlug, taskId: input.taskId, taskType: input.taskType, planFingerprint: input.plan.fingerprint, retrievalFingerprint: input.retrievalEligibility?.fingerprint, blocks });
  const base: Omit<TaskContextManifest, "fingerprint"> = {
    schemaVersion: "task-context-manifest.v1",
    manifestId: `task-context-${input.taskId}-${sourceFingerprint.slice(0, 16)}`,
    projectSlug: input.projectSlug,
    taskId: input.taskId,
    taskType: input.taskType,
    sourceFingerprint,
    blocks,
    status: input.statusOverride === "block" || planNotReady || t0Truncated || Object.keys(input.excludedBlocks || {}).length ? "block" : "pass",
    ...(input.sourceGate ? { sourceGate: input.sourceGate } : {}),
    ...(input.retrievalEligibility ? { retrievalEligibility: input.retrievalEligibility } : {}),
    warnings: [...new Set(warnings)],
    createdAt: input.createdAt || new Date().toISOString()
  };
  return { ...base, fingerprint: hash(base) };
}

function manifestPath(root: string, manifestId: string): string {
  return resolveInside(root, `tasks/context-manifests/${manifestId}.json`);
}

export function assertTaskContextManifestIntegrity(manifest: TaskContextManifest, expectedManifestId?: string): TaskContextManifest {
  const { fingerprint: _fingerprint, ...base } = manifest;
  const validBlocks = Array.isArray(manifest.blocks) && manifest.blocks.every((block) => typeof block.id === "string" && block.id.trim() && typeof block.title === "string" && block.title.trim() && Array.isArray(block.sourceRefs) && block.sourceRefs.length > 0 && block.sourceRefs.every((ref) => typeof ref === "string" && ref.trim()) && typeof block.sourceVersion === "string" && block.sourceVersion.trim() && /^[a-f0-9]{64}$/i.test(block.sourceHash) && Number.isInteger(block.originalTokens) && block.originalTokens >= 0 && Number.isInteger(block.finalTokens) && block.finalTokens >= 0 && ["none", "boundary-trim", "summary", "extract"].includes(block.compression) && ["model", "blocked"].includes(block.permission) && typeof block.selected === "boolean" && typeof block.truncated === "boolean" && (block.permission !== "blocked" || (typeof block.exclusionReason === "string" && block.exclusionReason.trim())));
  const statusValid = manifest.status === "pass" ? manifest.blocks.every((block) => block.permission === "model") : manifest.status === "block" && manifest.blocks.some((block) => block.permission === "blocked") || manifest.status === "block";
  if (manifest.schemaVersion !== "task-context-manifest.v1" || (expectedManifestId !== undefined && manifest.manifestId !== expectedManifestId) || !manifest.manifestId.trim() || !manifest.projectSlug.trim() || !manifest.taskId.trim() || !manifest.taskType || !/^[a-f0-9]{64}$/i.test(manifest.sourceFingerprint) || !validBlocks || !["pass", "block"].includes(manifest.status) || !statusValid || !Array.isArray(manifest.warnings) || manifest.warnings.some((warning) => typeof warning !== "string") || !Number.isFinite(Date.parse(manifest.createdAt)) || !/^[a-f0-9]{64}$/i.test(manifest.fingerprint) || hash(base) !== manifest.fingerprint) throw new Error("TASK_CONTEXT_MANIFEST_INTEGRITY_FAILED");
  return manifest;
}

export async function persistTaskContextManifest(root: string, manifest: TaskContextManifest): Promise<void> {
  assertTaskContextManifestIntegrity(manifest);
  const target = manifestPath(root, manifest.manifestId);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await fs.rename(temp, target);
}

export async function readTaskContextManifest(root: string, manifestId: string): Promise<TaskContextManifest | null> {
  try {
    const manifest = JSON.parse(await fs.readFile(manifestPath(root, manifestId), "utf8")) as TaskContextManifest;
    return assertTaskContextManifestIntegrity(manifest, manifestId);
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null;
    throw error;
  }
}

export async function evaluateTaskContextManifestFreshness(root: string, manifest: TaskContextManifest): Promise<{ status: "current" | "stale" | "unknown"; reasons: string[] }> {
  const concreteBlocks = manifest.blocks.filter((block) => block.selected && block.sourceRefs.some((ref) => !ref.startsWith("context://")));
  if (!concreteBlocks.length) return { status: "unknown", reasons: ["SOURCE_REF_FALLBACK_ONLY"] };
  const reasons: string[] = [];
  for (const block of concreteBlocks) {
    const ref = block.sourceRefs.find((item) => !item.startsWith("context://"));
    if (!ref) continue;
    try {
      const content = await fs.readFile(resolveInside(root, ref), "utf8");
      if (sourceVersionFor(ref, content) !== block.sourceVersion) reasons.push(`SOURCE_CHANGED:${ref}`);
    } catch {
      reasons.push(`SOURCE_MISSING:${ref}`);
    }
  }
  return reasons.length ? { status: "stale", reasons } : { status: "current", reasons: [] };
}
