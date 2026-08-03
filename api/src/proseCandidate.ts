import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import { readContextManifest } from "./contextManifest.js";
import { readCurrentProseGenerationManifest, readProseGenerationManifest } from "./proseGenerationManifest.js";
import type { DraftingRiskTier } from "./draftingPolicy.js";

export interface ProseGenerationManifest {
  schemaVersion: "prose-generation-manifest.v1";
  chapterId: string;
  outlineVersionId: string;
  executionProofFingerprint: string;
  contextManifestId: string;
  contextFingerprint: string;
  createdAt: string;
  manifestId?: string;
  manifestFingerprint?: string;
  decisionConsumptionReceiptRef?: string;
  chapterIntentRef?: string;
}

export interface ProseCandidate {
  schemaVersion: "prose-candidate.v1";
  candidateId: string;
  projectSlug: string;
  chapterId: string;
  policyVersion?: "tiered-quality.v1";
  riskTier?: DraftingRiskTier;
  status: "generated" | "validated" | "adopted" | "rejected";
  content: string;
  generation: ProseGenerationManifest;
  sourceFingerprint: string;
  createdAt: string;
  updatedAt: string;
  fingerprint: string;
}

export interface ProseCandidateValidation {
  candidateId: string;
  status: "passed" | "blocked";
  reasons: Array<"EMPTY_CONTENT" | "CONTEXT_MANIFEST_REQUIRED" | "CONTEXT_MANIFEST_STALE" | "GENERATION_MANIFEST_REQUIRED" | "GENERATION_MANIFEST_STALE" | "SOURCE_FINGERPRINT_MISMATCH">;
  candidateFingerprint: string;
  checkedAt: string;
}

function candidatePath(root: string, candidateId: string): string {
  return resolveInside(root, `sessions/prose-candidates/${candidateId}.json`);
}

function hash(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function hasValidFingerprint(candidate: ProseCandidate): boolean {
  if (!/^[a-f0-9]{64}$/i.test(candidate.fingerprint)) return false;
  const { fingerprint: _fingerprint, ...base } = candidate;
  return hash(base) === candidate.fingerprint;
}

function hasValidPolicyBinding(candidate: ProseCandidate): boolean {
  if (candidate.policyVersion === undefined && candidate.riskTier === undefined) return true;
  return candidate.policyVersion === "tiered-quality.v1" && ["ordinary", "elevated", "key"].includes(candidate.riskTier || "");
}

async function writeJson(target: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temp, target);
}

export function proseCandidateId(chapterId: string, sourceFingerprint: string): string {
  const safe = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, "-");
  return `prose-${safe(chapterId)}-${safe(sourceFingerprint.slice(0, 16))}`;
}

export async function readProseCandidate(root: string, candidateId: string): Promise<ProseCandidate | null> {
  try {
    const candidate = JSON.parse(await fs.readFile(candidatePath(root, candidateId), "utf8")) as ProseCandidate;
    if (candidate.schemaVersion !== "prose-candidate.v1" || candidate.candidateId !== candidateId || !hasValidPolicyBinding(candidate) || !hasValidFingerprint(candidate)) throw new Error("PROSE_CANDIDATE_INTEGRITY_FAILED");
    return candidate;
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null;
    throw error;
  }
}

export async function listProseCandidates(root: string): Promise<ProseCandidate[]> {
  const directory = resolveInside(root, "sessions/prose-candidates");
  const names = await fs.readdir(directory).catch(() => [] as string[]);
  const candidates: ProseCandidate[] = [];
  for (const name of names.filter((entry) => entry.endsWith(".json"))) {
    const candidate = await readProseCandidate(root, name.slice(0, -5));
    if (candidate) candidates.push(candidate);
  }
  return candidates.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function createProseCandidate(input: {
  root: string;
  projectSlug: string;
  chapterId: string;
  content: string;
  outlineVersionId: string;
  executionProofFingerprint: string;
  sourceFingerprint: string;
  policyVersion?: "tiered-quality.v1";
  riskTier?: DraftingRiskTier;
  generationManifestId?: string;
}): Promise<ProseCandidate> {
  const existing = await readProseCandidate(input.root, proseCandidateId(input.chapterId, input.sourceFingerprint));
  if (existing) {
    if (input.policyVersion !== undefined && (existing.policyVersion !== input.policyVersion || existing.riskTier !== input.riskTier)) throw new Error("PROSE_CANDIDATE_POLICY_CONFLICT");
    return existing;
  }
  const context = await readContextManifest(input.root, { allowLegacyExecutionMetadata: true });
  const frozenManifest = input.generationManifestId ? await readProseGenerationManifest(input.root, input.generationManifestId) : null;
  if (input.generationManifestId && !frozenManifest) throw new Error("PROSE_GENERATION_MANIFEST_REQUIRED");
  const createdAt = new Date().toISOString();
  const generation: ProseGenerationManifest = {
    schemaVersion: "prose-generation-manifest.v1",
    chapterId: input.chapterId,
    outlineVersionId: input.outlineVersionId,
    executionProofFingerprint: input.executionProofFingerprint,
    contextManifestId: context?.manifestId || "",
    contextFingerprint: context?.sourceFingerprint || "",
    createdAt,
    ...(frozenManifest ? { manifestId: frozenManifest.manifestId, manifestFingerprint: frozenManifest.fingerprint, decisionConsumptionReceiptRef: frozenManifest.decisionConsumptionReceiptRef, chapterIntentRef: frozenManifest.chapterIntentRef } : {})
  };
  const base = {
    schemaVersion: "prose-candidate.v1" as const,
    candidateId: proseCandidateId(input.chapterId, input.sourceFingerprint),
    projectSlug: input.projectSlug,
    chapterId: input.chapterId,
    ...(input.policyVersion ? { policyVersion: input.policyVersion } : {}),
    ...(input.riskTier ? { riskTier: input.riskTier } : {}),
    status: "generated" as const,
    content: input.content,
    generation,
    sourceFingerprint: input.sourceFingerprint,
    createdAt,
    updatedAt: createdAt
  };
  const candidate: ProseCandidate = { ...base, fingerprint: hash(base) };
  await writeJson(candidatePath(input.root, candidate.candidateId), candidate);
  return candidate;
}

export async function validateProseCandidate(root: string, candidate: ProseCandidate): Promise<ProseCandidateValidation> {
  const reasons: ProseCandidateValidation["reasons"] = [];
  if (!candidate.content.trim()) reasons.push("EMPTY_CONTENT");
  const context = await readContextManifest(root, { allowLegacyExecutionMetadata: true });
  if (!context) reasons.push("CONTEXT_MANIFEST_REQUIRED");
  else if (context.manifestId !== candidate.generation.contextManifestId || context.sourceFingerprint !== candidate.generation.contextFingerprint) reasons.push("CONTEXT_MANIFEST_STALE");
  if (candidate.generation.manifestId) {
    const generationManifest = await readProseGenerationManifest(root, candidate.generation.manifestId);
    if (!generationManifest) reasons.push("GENERATION_MANIFEST_REQUIRED");
    else if (generationManifest.fingerprint !== candidate.generation.manifestFingerprint || generationManifest.decisionConsumptionReceiptRef !== candidate.generation.decisionConsumptionReceiptRef) reasons.push("GENERATION_MANIFEST_STALE");
    if (generationManifest && candidate.generation.chapterIntentRef) {
      const currentManifest = await readCurrentProseGenerationManifest(root, candidate.generation.chapterIntentRef);
      if (!currentManifest) reasons.push("GENERATION_MANIFEST_REQUIRED");
      else if (currentManifest.manifestId !== generationManifest.manifestId || currentManifest.fingerprint !== generationManifest.fingerprint) reasons.push("GENERATION_MANIFEST_STALE");
    }
  }
  const expectedFingerprint = hash({
    schemaVersion: candidate.schemaVersion,
    candidateId: candidate.candidateId,
    projectSlug: candidate.projectSlug,
    chapterId: candidate.chapterId,
    ...(candidate.policyVersion ? { policyVersion: candidate.policyVersion } : {}),
    ...(candidate.riskTier ? { riskTier: candidate.riskTier } : {}),
    status: candidate.status,
    content: candidate.content,
    generation: candidate.generation,
    sourceFingerprint: candidate.sourceFingerprint,
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt
  });
  if (expectedFingerprint !== candidate.fingerprint) reasons.push("SOURCE_FINGERPRINT_MISMATCH");
  return {
    candidateId: candidate.candidateId,
    status: reasons.length ? "blocked" : "passed",
    reasons,
    candidateFingerprint: candidate.fingerprint,
    checkedAt: new Date().toISOString()
  };
}
