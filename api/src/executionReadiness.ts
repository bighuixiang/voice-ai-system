import fs from "node:fs/promises";
import crypto from "node:crypto";
import { resolveInside } from "./pathSafety.js";
import { readExecutionReadyProof, readOutlineVersion, type ExecutionReadyProof, type OutlineVersion } from "./outlineCommit.js";
import { readOutlineCandidateFingerprint } from "./outlineCandidate.js";

export interface ExecutionReadinessCheck {
  checkId: "proof-integrity" | "version-integrity" | "outline-source-freshness" | "execution-binding" | "proof-current" | "version-pointer" | "chapter-in-window";
  status: "passed" | "failed";
  detail: string;
}

export interface ExecutionReadinessDecision {
  allowed: boolean;
  reason?: "PROOF_NOT_FOUND" | "PROOF_TAMPERED" | "VERSION_TAMPERED" | "OUTLINE_SOURCE_STALE" | "EXECUTION_BINDING_STALE" | "PROOF_BLOCKED" | "VERSION_POINTER_STALE" | "CHAPTER_OUTSIDE_WINDOW";
  proof?: ExecutionReadyProof;
  version?: OutlineVersion;
  checks: ExecutionReadinessCheck[];
}

function fingerprintMatches(value: { fingerprint: string }): boolean {
  const { fingerprint, ...base } = value;
  return crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex") === fingerprint;
}

async function readProjectOutlinePointer(root: string): Promise<{ versionId?: string; fingerprint?: string } | null> {
  try {
    const project = JSON.parse(await fs.readFile(resolveInside(root, "project.json"), "utf8")) as { outlineVersion?: { versionId?: string; fingerprint?: string } };
    return project.outlineVersion || null;
  } catch { return null; }
}

export async function checkExecutionReadiness(root: string, chapterId: string): Promise<ExecutionReadinessDecision> {
  let proof: ExecutionReadyProof | null;
  try { proof = await readExecutionReadyProof(root); }
  catch (error) {
    if (error instanceof Error && error.message === "EXECUTION_READY_PROOF_INTEGRITY_FAILED") return { allowed: false, reason: "PROOF_TAMPERED", checks: [{ checkId: "proof-integrity", status: "failed", detail: "Execution-ready proof failed persisted integrity validation." }] };
    throw error;
  }
  const checks: ExecutionReadinessCheck[] = [];
  if (!proof) return { allowed: false, reason: "PROOF_NOT_FOUND", checks: [{ checkId: "proof-current", status: "failed", detail: "No execution-ready proof exists." }] };
  const proofIntegrity = fingerprintMatches(proof);
  checks.push({ checkId: "proof-integrity", status: proofIntegrity ? "passed" : "failed", detail: "Execution-ready proof content must match its persisted fingerprint." });
  if (!proofIntegrity) return { allowed: false, reason: "PROOF_TAMPERED", proof, checks };
  checks.push({ checkId: "proof-current", status: proof.status === "ready" && proof.executionReady ? "passed" : "failed", detail: "Execution-ready proof must be current and ready." });
  let version: OutlineVersion | null;
  try { version = await readOutlineVersion(root, proof.versionId.replace(/^outline-version-/, "")); }
  catch (error) {
    if (error instanceof Error && error.message === "OUTLINE_VERSION_INTEGRITY_FAILED") return { allowed: false, reason: "VERSION_TAMPERED", proof, checks: [...checks, { checkId: "version-integrity", status: "failed", detail: "Adopted outline version failed persisted integrity validation." }] };
    throw error;
  }
  const versionIntegrity = Boolean(version && fingerprintMatches(version));
  checks.push({ checkId: "version-integrity", status: versionIntegrity ? "passed" : "failed", detail: "Adopted outline version content must match its persisted fingerprint." });
  if (!version) return { allowed: false, reason: "VERSION_POINTER_STALE", proof, checks };
  if (!versionIntegrity) return { allowed: false, reason: "VERSION_TAMPERED", proof, version, checks };
  const outlineFingerprint = await readOutlineCandidateFingerprint(root, version.outlineId);
  const outlineSourceFresh = Boolean(outlineFingerprint && outlineFingerprint === version.outlineFingerprint);
  checks.push({ checkId: "outline-source-freshness", status: outlineSourceFresh ? "passed" : "failed", detail: "The adopted outline version must still reference the current outline candidate fingerprint." });
  if (!outlineSourceFresh || !outlineFingerprint) return { allowed: false, reason: "OUTLINE_SOURCE_STALE", proof, version, checks };
  const comparisonBinding = version.comparisonFingerprint === proof.comparisonFingerprint && (version.comparisonFingerprint === undefined || /^[a-f0-9]{64}$/i.test(version.comparisonFingerprint));
  const executionBinding = Boolean(version.structureVersionFingerprint && proof.structureVersionFingerprint && version.structureVersionFingerprint === outlineFingerprint && proof.structureVersionFingerprint === version.structureVersionFingerprint && ["L0", "L1", "L2"].includes(version.changeLevel) && proof.changeLevel === version.changeLevel && version.adoptionAuthority.trim() && proof.adoptionAuthority === version.adoptionAuthority && version.adoptionProofFingerprint.trim() && proof.adoptionProofFingerprint === version.adoptionProofFingerprint && comparisonBinding);
  checks.push({ checkId: "execution-binding", status: executionBinding ? "passed" : "failed", detail: "Execution readiness must bind the current structure fingerprint, change level, and adoption authority." });
  if (!executionBinding) return { allowed: false, reason: "EXECUTION_BINDING_STALE", proof, version, checks };
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
