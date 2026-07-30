import fs from "node:fs/promises";
import { resolveInside } from "./pathSafety.js";
import { readExecutionReadyProof, readOutlineVersion, type ExecutionReadyProof, type OutlineVersion } from "./outlineCommit.js";

export interface ExecutionReadinessCheck {
  checkId: "proof-current" | "version-pointer" | "chapter-in-window";
  status: "passed" | "failed";
  detail: string;
}

export interface ExecutionReadinessDecision {
  allowed: boolean;
  reason?: "PROOF_NOT_FOUND" | "PROOF_BLOCKED" | "VERSION_POINTER_STALE" | "CHAPTER_OUTSIDE_WINDOW";
  proof?: ExecutionReadyProof;
  version?: OutlineVersion;
  checks: ExecutionReadinessCheck[];
}

async function readProjectOutlinePointer(root: string): Promise<{ versionId?: string; fingerprint?: string } | null> {
  try {
    const project = JSON.parse(await fs.readFile(resolveInside(root, "project.json"), "utf8")) as { outlineVersion?: { versionId?: string; fingerprint?: string } };
    return project.outlineVersion || null;
  } catch { return null; }
}

export async function checkExecutionReadiness(root: string, chapterId: string): Promise<ExecutionReadinessDecision> {
  const proof = await readExecutionReadyProof(root);
  const checks: ExecutionReadinessCheck[] = [];
  if (!proof) return { allowed: false, reason: "PROOF_NOT_FOUND", checks: [{ checkId: "proof-current", status: "failed", detail: "No execution-ready proof exists." }] };
  checks.push({ checkId: "proof-current", status: proof.status === "ready" && proof.executionReady ? "passed" : "failed", detail: "Execution-ready proof must be current and ready." });
  const version = await readOutlineVersion(root, proof.versionId.replace(/^outline-version-/, ""));
  const pointer = await readProjectOutlinePointer(root);
  const pointerMatches = Boolean(version && pointer && pointer.versionId === version.versionId && pointer.fingerprint === version.fingerprint && proof.versionFingerprint === version.fingerprint);
  checks.push({ checkId: "version-pointer", status: pointerMatches ? "passed" : "failed", detail: "Project outline pointer must match the proof version fingerprint." });
  const chapterInWindow = Boolean(version?.selectedChapterIds.includes(chapterId));
  checks.push({ checkId: "chapter-in-window", status: chapterInWindow ? "passed" : "failed", detail: "Target chapter must belong to the adopted rolling window." });
  if (!pointerMatches) return { allowed: false, reason: "VERSION_POINTER_STALE", proof, version: version || undefined, checks };
  if (!chapterInWindow) return { allowed: false, reason: "CHAPTER_OUTSIDE_WINDOW", proof, version: version || undefined, checks };
  if (proof.status !== "ready" || !proof.executionReady) return { allowed: false, reason: "PROOF_BLOCKED", proof, version: version || undefined, checks };
  return { allowed: true, proof, version: version || undefined, checks };
}
