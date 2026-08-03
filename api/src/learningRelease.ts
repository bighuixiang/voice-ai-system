import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import { evaluateLearningRelease } from "./learningReleaseGate.js";
import { readCraftPattern } from "./craftPattern.js";
import { listCraftRevocationRecords } from "./craftRevocationStore.js";
import { readEvaluationRegression } from "./evaluationRegressionStore.js";

export type LearningReleaseStatus = "rejected" | "canary" | "default" | "rolled_back";

export interface LearningRelease {
  schemaVersion: "learning-release.v1";
  releaseId: string;
  projectSlug: string;
  candidatePolicyRef: string;
  candidatePatternId?: string;
  baselinePolicyRef: string;
  evaluationRunRefs: string[];
  regressionCaseRefs?: string[];
  shadowAcceptanceDelta: number;
  hardVoiceFailuresDelta: number;
  reworkDelta: number;
  canaryActive: boolean;
  previousStableVersion: string;
  rollbackRef: string | null;
  status: LearningReleaseStatus;
  reasons: string[];
  approvedBy: string;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  rollbackReason?: string;
  rolledBackBy?: string;
  rolledBackAt?: string;
  fingerprint: string;
}

const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const releasePath = (root: string, releaseId: string) => resolveInside(root, `sessions/learning-releases/${releaseId}.json`);

async function readJson(root: string, releaseId: string): Promise<LearningRelease | null> {
  try { return JSON.parse(await fs.readFile(releasePath(root, releaseId), "utf8")) as LearningRelease; }
  catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}

async function writeJson(root: string, release: LearningRelease): Promise<void> {
  const target = releasePath(root, release.releaseId);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(release, null, 2)}\n`, "utf8");
  await fs.rename(temporary, target);
}

export function assertLearningReleaseIntegrity(release: LearningRelease): LearningRelease {
  const { fingerprint, ...base } = release;
  if (release.schemaVersion !== "learning-release.v1" || !release.releaseId.trim() || !release.projectSlug.trim() || !release.candidatePolicyRef.trim() || !release.baselinePolicyRef.trim() || !release.evaluationRunRefs.length || release.evaluationRunRefs.some((ref) => !ref.trim()) || (release.regressionCaseRefs !== undefined && (release.regressionCaseRefs.some((ref) => !ref.trim()) || new Set(release.regressionCaseRefs).size !== release.regressionCaseRefs.length)) || !release.previousStableVersion.trim() || release.rollbackRef !== release.previousStableVersion || !release.approvedBy.trim() || !Number.isFinite(release.shadowAcceptanceDelta) || !Number.isFinite(release.hardVoiceFailuresDelta) || !Number.isFinite(release.reworkDelta) || !["rejected", "canary", "default", "rolled_back"].includes(release.status) || (release.status === "canary" && release.canaryActive !== true) || !Number.isFinite(Date.parse(release.createdAt)) || !Number.isFinite(Date.parse(release.updatedAt)) || (release.expiresAt !== undefined && !Number.isFinite(Date.parse(release.expiresAt))) || !/^[a-f0-9]{64}$/i.test(fingerprint) || hash(base) !== fingerprint) throw new Error("LEARNING_RELEASE_INTEGRITY_FAILED");
  return release;
}

export async function readLearningRelease(root: string, releaseId: string): Promise<LearningRelease | null> {
  const value = await readJson(root, releaseId);
  return value ? assertLearningReleaseIntegrity(value) : null;
}

export async function listLearningReleases(root: string, projectSlug: string): Promise<LearningRelease[]> {
  const directory = resolveInside(root, "sessions/learning-releases");
  let names: string[];
  try { names = await fs.readdir(directory); } catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return []; throw error; }
  const values = await Promise.all(names.filter((name) => name.endsWith(".json")).map((name) => readLearningRelease(root, name.slice(0, -5))));
  return values.filter((value): value is LearningRelease => Boolean(value && value.projectSlug === projectSlug));
}

export async function assertCraftPatternReleaseRefs(root: string, projectSlug: string, patternRefs: readonly string[]): Promise<void> {
  const releases = await listLearningReleases(root, projectSlug);
  const revocations = await listCraftRevocationRecords(root, projectSlug);
  for (const patternRef of patternRefs) {
    const pattern = await readCraftPattern(root, patternRef);
    if (!pattern) throw new Error("PROSE_MANIFEST_CRAFT_PATTERN_NOT_FOUND");
    if (pattern.projectSlug !== projectSlug) throw new Error("PROSE_MANIFEST_CRAFT_PATTERN_PROJECT_MISMATCH");
    if (revocations.some((record) => record.propagation.invalidatedArtifactIds.includes(patternRef))) throw new Error("PROSE_MANIFEST_CRAFT_PATTERN_REVOKED");
    if (!releases.some((release) => release.candidatePatternId === patternRef && (release.status === "canary" || release.status === "default") && (!release.expiresAt || Date.parse(release.expiresAt) > Date.now()))) throw new Error("PROSE_MANIFEST_CRAFT_PATTERN_RELEASE_REQUIRED");
  }
}

export async function createLearningRelease(input: {
  root: string;
  projectSlug: string;
  releaseId: string;
  candidatePolicyRef: string;
  candidatePatternId?: string;
  baselinePolicyRef: string;
  evaluationRunRefs: string[];
  regressionCaseRefs?: string[];
  shadowAcceptanceDelta: number;
  hardVoiceFailuresDelta: number;
  reworkDelta: number;
  canaryActive: boolean;
  previousStableVersion: string;
  approvedBy: string;
  expiresAt?: string;
}): Promise<LearningRelease> {
  if (!input.projectSlug.trim() || !input.releaseId.trim() || !input.candidatePolicyRef.trim() || !input.baselinePolicyRef.trim() || !input.evaluationRunRefs.length || input.evaluationRunRefs.some((ref) => !ref.trim()) || (input.regressionCaseRefs !== undefined && (!input.regressionCaseRefs.length || input.regressionCaseRefs.some((ref) => !ref.trim()) || new Set(input.regressionCaseRefs).size !== input.regressionCaseRefs.length)) || !input.previousStableVersion.trim() || !input.approvedBy.trim() || (input.expiresAt !== undefined && !Number.isFinite(Date.parse(input.expiresAt)))) throw new Error("LEARNING_RELEASE_INPUT_INVALID");
  if (input.candidatePatternId) {
    const pattern = await readCraftPattern(input.root, input.candidatePatternId);
    if (!pattern || pattern.projectSlug !== input.projectSlug || pattern.lifecycle !== "validated") throw new Error("LEARNING_RELEASE_PATTERN_REQUIRED");
  }
  if (input.regressionCaseRefs) {
    for (const regressionCaseRef of input.regressionCaseRefs) {
      const regression = await readEvaluationRegression(input.root, regressionCaseRef);
      if (!regression) throw new Error("LEARNING_RELEASE_REGRESSION_EVIDENCE_REQUIRED");
      if (regression.projectSlug !== input.projectSlug) throw new Error("LEARNING_RELEASE_REGRESSION_PROJECT_MISMATCH");
    }
  }
  const existing = await readLearningRelease(input.root, input.releaseId);
  if (existing) {
    if (existing.projectSlug !== input.projectSlug) throw new Error("LEARNING_RELEASE_PROJECT_MISMATCH");
    return existing;
  }
  const gate = evaluateLearningRelease(input);
  const status: LearningReleaseStatus = gate.status === "approved" ? (input.canaryActive ? "canary" : "default") : gate.status;
  const now = new Date().toISOString();
  const base = { schemaVersion: "learning-release.v1" as const, releaseId: input.releaseId, projectSlug: input.projectSlug, candidatePolicyRef: input.candidatePolicyRef, ...(input.candidatePatternId ? { candidatePatternId: input.candidatePatternId } : {}), baselinePolicyRef: input.baselinePolicyRef, evaluationRunRefs: [...input.evaluationRunRefs], ...(input.regressionCaseRefs ? { regressionCaseRefs: [...input.regressionCaseRefs] } : {}), shadowAcceptanceDelta: input.shadowAcceptanceDelta, hardVoiceFailuresDelta: input.hardVoiceFailuresDelta, reworkDelta: input.reworkDelta, canaryActive: input.canaryActive, previousStableVersion: input.previousStableVersion, rollbackRef: input.previousStableVersion || null, status, reasons: gate.reasons, approvedBy: input.approvedBy, createdAt: now, updatedAt: now, ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}) };
  const release: LearningRelease = { ...base, fingerprint: hash(base) };
  await writeJson(input.root, release);
  return release;
}

export async function rollbackLearningRelease(input: { root: string; releaseId: string; rolledBackBy: string; reason: string }): Promise<LearningRelease> {
  if (!input.rolledBackBy.trim() || !input.reason.trim()) throw new Error("LEARNING_RELEASE_ROLLBACK_REASON_REQUIRED");
  const existing = await readLearningRelease(input.root, input.releaseId);
  if (!existing) throw new Error("LEARNING_RELEASE_NOT_FOUND");
  if (existing.status === "rejected") throw new Error("LEARNING_RELEASE_ROLLBACK_NOT_ALLOWED");
  if (existing.status === "rolled_back") return existing;
  const { fingerprint: _fingerprint, ...existingBase } = existing;
  const base = { ...existingBase, status: "rolled_back" as const, updatedAt: new Date().toISOString(), rollbackReason: input.reason, rolledBackBy: input.rolledBackBy, rolledBackAt: new Date().toISOString() };
  const result: LearningRelease = { ...base, fingerprint: hash(base) };
  await writeJson(input.root, result);
  return result;
}

export async function rollbackLearningReleaseForRegression(input: { root: string; projectSlug: string; releaseId: string; regressionCaseRef: string; rolledBackBy: string; reason: string }): Promise<LearningRelease> {
  if (!input.projectSlug.trim() || !input.regressionCaseRef.trim()) throw new Error("LEARNING_RELEASE_REGRESSION_ROLLBACK_INPUT_INVALID");
  const regression = await readEvaluationRegression(input.root, input.regressionCaseRef);
  if (!regression) throw new Error("LEARNING_RELEASE_REGRESSION_EVIDENCE_REQUIRED");
  if (regression.projectSlug !== input.projectSlug) throw new Error("LEARNING_RELEASE_REGRESSION_PROJECT_MISMATCH");
  if (regression.result.status !== "regression") throw new Error("LEARNING_RELEASE_REGRESSION_NOT_CONFIRMED");
  const release = await readLearningRelease(input.root, input.releaseId);
  if (!release || release.projectSlug !== input.projectSlug) throw new Error("LEARNING_RELEASE_NOT_FOUND");
  if (!release.regressionCaseRefs?.includes(input.regressionCaseRef)) throw new Error("LEARNING_RELEASE_REGRESSION_NOT_BOUND");
  return rollbackLearningRelease({ root: input.root, releaseId: input.releaseId, rolledBackBy: input.rolledBackBy, reason: `${input.reason} [regression:${input.regressionCaseRef}]` });
}

export async function rollbackLearningReleasesForRegression(input: { root: string; projectSlug: string; regressionCaseRef: string; rolledBackBy: string; reason: string }): Promise<LearningRelease[]> {
  const releases = await listLearningReleases(input.root, input.projectSlug);
  const bound = releases.filter((release) => release.regressionCaseRefs?.includes(input.regressionCaseRef) && (release.status === "canary" || release.status === "default"));
  const results: LearningRelease[] = [];
  for (const release of bound) {
    results.push(await rollbackLearningReleaseForRegression({ ...input, releaseId: release.releaseId }));
  }
  return results;
}
