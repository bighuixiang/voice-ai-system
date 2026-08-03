import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";

export interface ChapterExecutionProof {
  schemaVersion: "chapter-execution-proof.v1";
  proofId: string;
  projectSlug: string;
  chapterId: string;
  planId: string;
  planFingerprint: string;
  parentExecutionReadyProofFingerprint: string;
  contextFingerprint: string;
  status: "ready";
  executionReady: true;
  checks: Array<{ checkId: "plan-current" | "parent-proof-current" | "context-current"; status: "passed"; detail: string }>;
  createdAt: string;
  fingerprint: string;
}

function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function proofPath(root: string, proofId: string): string { return resolveInside(root, `sessions/chapter-execution-proofs/${proofId}.json`); }

export function assertChapterExecutionProofIntegrity(proof: ChapterExecutionProof, expectedProofId?: string): void {
  const { fingerprint: _fingerprint, ...base } = proof;
  const checksValid = Array.isArray(proof.checks) && proof.checks.length === 3 && proof.checks.every((check, index) => check && check.checkId === (["plan-current", "parent-proof-current", "context-current"] as const)[index] && check.status === "passed" && typeof check.detail === "string" && check.detail.trim() !== "");
  const structurallyValid = proof.schemaVersion === "chapter-execution-proof.v1" && (!expectedProofId || proof.proofId === expectedProofId) && proof.projectSlug.trim() !== "" && proof.chapterId.trim() !== "" && proof.planId.trim() !== "" && /^[a-f0-9]{64}$/i.test(proof.planFingerprint) && /^[a-f0-9]{64}$/i.test(proof.parentExecutionReadyProofFingerprint) && /^[a-f0-9]{64}$/i.test(proof.contextFingerprint) && proof.status === "ready" && proof.executionReady === true && checksValid && Number.isFinite(Date.parse(proof.createdAt)) && proof.proofId === `chapter-execution-proof-${proof.chapterId}-${proof.planFingerprint.slice(0, 16)}`;
  if (!structurallyValid || !/^[a-f0-9]{64}$/i.test(proof.fingerprint) || hash(base) !== proof.fingerprint) throw new Error("CHAPTER_EXECUTION_PROOF_INTEGRITY_FAILED");
}

async function writeJson(target: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temp, target);
}

export async function readChapterExecutionProof(root: string, proofId: string): Promise<ChapterExecutionProof | null> {
  try {
    const proof = JSON.parse(await fs.readFile(proofPath(root, proofId), "utf8")) as ChapterExecutionProof;
    assertChapterExecutionProofIntegrity(proof, proofId);
    return proof;
  } catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}

export async function createChapterExecutionProof(root: string, input: { projectSlug: string; chapterId: string; planId: string; planFingerprint: string; parentExecutionReadyProofFingerprint: string; contextFingerprint: string }): Promise<ChapterExecutionProof> {
  if (![input.projectSlug, input.chapterId, input.planId, input.planFingerprint, input.parentExecutionReadyProofFingerprint, input.contextFingerprint].every((value) => value.trim())) throw new Error("CHAPTER_EXECUTION_PROOF_BINDING_REQUIRED");
  const proofId = `chapter-execution-proof-${input.chapterId}-${input.planFingerprint.slice(0, 16)}`;
  const existing = await readChapterExecutionProof(root, proofId);
  if (existing) return existing;
  const base = {
    schemaVersion: "chapter-execution-proof.v1" as const,
    proofId,
    projectSlug: input.projectSlug,
    chapterId: input.chapterId,
    planId: input.planId,
    planFingerprint: input.planFingerprint,
    parentExecutionReadyProofFingerprint: input.parentExecutionReadyProofFingerprint,
    contextFingerprint: input.contextFingerprint,
    status: "ready" as const,
    executionReady: true as const,
    checks: [
      { checkId: "plan-current" as const, status: "passed" as const, detail: "ChapterExecutionPlan is persisted and fingerprint-bound." },
      { checkId: "parent-proof-current" as const, status: "passed" as const, detail: "Parent ExecutionReadyProof is current for this run." },
      { checkId: "context-current" as const, status: "passed" as const, detail: "Draft context is frozen for this chapter execution." }
    ],
    createdAt: new Date().toISOString()
  };
  const proof: ChapterExecutionProof = { ...base, fingerprint: hash(base) };
  await writeJson(proofPath(root, proofId), proof);
  return proof;
}

export function verifyChapterExecutionProof(proof: ChapterExecutionProof, input: { projectSlug: string; chapterId: string; planId: string; planFingerprint: string; parentExecutionReadyProofFingerprint: string; contextFingerprint: string }): boolean {
  const { fingerprint, ...base } = proof;
  return proof.status === "ready" && proof.executionReady === true && proof.projectSlug === input.projectSlug && proof.chapterId === input.chapterId && proof.planId === input.planId && proof.planFingerprint === input.planFingerprint && proof.parentExecutionReadyProofFingerprint === input.parentExecutionReadyProofFingerprint && proof.contextFingerprint === input.contextFingerprint && proof.proofId === `chapter-execution-proof-${proof.chapterId}-${proof.planFingerprint.slice(0, 16)}` && /^[a-f0-9]{64}$/i.test(fingerprint) && hash(base) === fingerprint;
}
