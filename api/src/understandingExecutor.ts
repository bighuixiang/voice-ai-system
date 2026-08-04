import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import { buildUnderstandingPreview, type UnderstandingClaim } from "./understandingPreview.js";
import type { CreativeSession } from "./creativeSession.js";
import type { ContextManifest } from "./contextManifest.js";
import type { UnderstandingBudgetReservation } from "./understandingBudget.js";
import type { UnderstandingCapabilityAuthorization } from "./understandingAuthorization.js";
import type { UnderstandingRiskProfile } from "./understandingRiskProfile.js";

export interface UnderstandingQuestion {
  id: "question-primary-desire";
  text: string;
  status: "candidate";
  impact: "high";
  source: "deterministic-gap" | "model-gap";
}

export interface UnderstandingInterpretation {
  id: string;
  label: string;
  summary: string;
  status: "candidate" | "active" | "rejected" | "merged" | "superseded";
  differences: string[];
  supportEvidence: UnderstandingClaim[];
  counterEvidence: UnderstandingClaim[];
  downstreamImpacts: string[];
}

export interface UnderstandingInterpretationSet {
  schemaVersion: "seed-interpretation-set.v1";
  commonClaims: UnderstandingClaim[];
  interpretations: UnderstandingInterpretation[];
  activeQuestionId: UnderstandingQuestion["id"];
}

export interface UnderstandingSnapshot {
  schemaVersion: "understanding-snapshot.v1";
  snapshotId: string;
  projectSlug: string;
  mode: "shadow" | "model";
  sourceFingerprint: string;
  sourceMessageIds: string[];
  coreExplicit: UnderstandingClaim[];
  inferred: UnderstandingClaim[];
  unknowns: UnderstandingClaim[];
  question: UnderstandingQuestion;
  interpretationSet?: UnderstandingInterpretationSet;
  modelCallIssued: boolean;
  canonWritten: false;
  createdAt: string;
  fingerprint: string;
}

export interface UnderstandingRun {
  schemaVersion: "understanding-run.v1";
  runId: string;
  projectSlug: string;
  status: "completed";
  executionMode: "shadow";
  sourceFingerprint: string;
  riskProfileFingerprint: string;
  budgetReservationId: string;
  capabilityAuthorizationFingerprint: string;
  snapshotId: string;
  modelCallIssued: false;
  canonWritten: false;
  createdAt: string;
  completedAt: string;
}

function hash(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function validClaim(value: unknown): value is UnderstandingClaim {
  const claim = value as UnderstandingClaim;
  return Boolean(claim && typeof claim.id === "string" && claim.id.trim() && typeof claim.text === "string" && claim.text.trim() && ["explicit", "inferred", "provisional", "unknown", "conflicted"].includes(claim.status)) && Array.isArray(claim.evidence) && claim.evidence.every((span) => Boolean(span && typeof span.messageId === "string" && span.messageId.trim() && Number.isInteger(span.start) && span.start >= 0 && Number.isInteger(span.end) && span.end >= span.start));
}

function validInterpretationSet(value: unknown): boolean {
  const set = value as UnderstandingInterpretationSet;
  if (!set || set.schemaVersion !== "seed-interpretation-set.v1" || set.activeQuestionId !== "question-primary-desire" || !Array.isArray(set.commonClaims) || !set.commonClaims.every(validClaim) || !Array.isArray(set.interpretations) || set.interpretations.length < 2) return false;
  const ids = new Set<string>();
  return set.interpretations.every((branch) => {
    if (!branch || typeof branch.id !== "string" || !branch.id.trim() || ids.has(branch.id) || typeof branch.label !== "string" || !branch.label.trim() || typeof branch.summary !== "string" || !branch.summary.trim() || branch.status !== "candidate" || !Array.isArray(branch.differences) || !branch.differences.every((item) => typeof item === "string" && item.trim()) || !Array.isArray(branch.supportEvidence) || !branch.supportEvidence.every(validClaim) || !Array.isArray(branch.counterEvidence) || !branch.counterEvidence.every(validClaim) || !Array.isArray(branch.downstreamImpacts) || !branch.downstreamImpacts.every((item) => typeof item === "string" && item.trim())) return false;
    ids.add(branch.id);
    return true;
  });
}

export function assertUnderstandingSnapshotIntegrity(snapshot: UnderstandingSnapshot): UnderstandingSnapshot {
  const { fingerprint: _fingerprint, ...base } = snapshot;
  const question = snapshot.question;
  const valid = snapshot.schemaVersion === "understanding-snapshot.v1" && ["shadow", "model"].includes(snapshot.mode) && Boolean(snapshot.snapshotId?.trim() && snapshot.projectSlug?.trim() && snapshot.sourceFingerprint?.trim()) && Array.isArray(snapshot.sourceMessageIds) && snapshot.sourceMessageIds.every((id) => typeof id === "string" && id.trim()) && Array.isArray(snapshot.coreExplicit) && snapshot.coreExplicit.every(validClaim) && Array.isArray(snapshot.inferred) && snapshot.inferred.every(validClaim) && Array.isArray(snapshot.unknowns) && snapshot.unknowns.every(validClaim) && (snapshot.interpretationSet === undefined || validInterpretationSet(snapshot.interpretationSet)) && question?.id === "question-primary-desire" && typeof question.text === "string" && question.text.trim().length > 0 && question.status === "candidate" && question.impact === "high" && ["deterministic-gap", "model-gap"].includes(question.source) && snapshot.modelCallIssued === (snapshot.mode === "model") && snapshot.canonWritten === false && typeof snapshot.createdAt === "string" && snapshot.createdAt.trim().length > 0 && /^[a-f0-9]{64}$/i.test(snapshot.fingerprint) && hash(base) === snapshot.fingerprint;
  if (!valid) throw new Error("UNDERSTANDING_SNAPSHOT_INTEGRITY_FAILED");
  return snapshot;
}

async function writeJson(root: string, relativePath: string, value: unknown): Promise<void> {
  const target = resolveInside(root, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temp, target);
}

async function persistShadowSnapshot(input: {
  root: string;
  projectSlug: string;
  session: CreativeSession;
  manifest: ContextManifest;
}): Promise<UnderstandingSnapshot> {
  const preview = buildUnderstandingPreview(input.session);
  const snapshotBase: Omit<UnderstandingSnapshot, "fingerprint"> = {
    schemaVersion: "understanding-snapshot.v1" as const,
    snapshotId: `understanding-shadow-${input.manifest.sourceFingerprint.slice(0, 16)}`,
    projectSlug: input.projectSlug,
    mode: "shadow" as const,
    sourceFingerprint: input.manifest.sourceFingerprint,
    sourceMessageIds: preview.sourceMessageIds,
    coreExplicit: preview.coreExplicit,
    inferred: [],
    unknowns: preview.unknowns,
    question: {
      id: "question-primary-desire",
      text: "What must the protagonist want most in the opening movement?",
      status: "candidate",
      impact: "high",
      source: "deterministic-gap"
    },
    modelCallIssued: false,
    canonWritten: false,
    createdAt: new Date().toISOString()
  };
  const snapshot: UnderstandingSnapshot = { ...snapshotBase, fingerprint: hash(snapshotBase) };
  await writeJson(input.root, "sessions/understanding-snapshot.json", snapshot);
  return snapshot;
}

/** Builds the non-AI, non-canon understanding baseline from a frozen author input. */
export async function executeDeterministicUnderstanding(input: {
  root: string;
  projectSlug: string;
  session: CreativeSession;
  manifest: ContextManifest;
}): Promise<{ snapshot: UnderstandingSnapshot }> {
  return { snapshot: await persistShadowSnapshot(input) };
}

export async function executeShadowUnderstanding(input: {
  root: string;
  projectSlug: string;
  session: CreativeSession;
  manifest: ContextManifest;
  riskProfile: UnderstandingRiskProfile;
  budget: UnderstandingBudgetReservation;
  capability: UnderstandingCapabilityAuthorization;
}): Promise<{ run: UnderstandingRun; snapshot: UnderstandingSnapshot }> {
  if (!input.budget) throw new Error("UNDERSTANDING_BUDGET_REQUIRED");
  if (input.budget.manifestFingerprint !== input.manifest.sourceFingerprint) throw new Error("UNDERSTANDING_BUDGET_STALE");
  if (!input.capability || input.capability.status !== "authorized" || !input.capability.modelCallAllowed) throw new Error("UNDERSTANDING_CAPABILITY_REQUIRED");
  if (input.capability.manifestFingerprint !== input.manifest.sourceFingerprint || input.capability.budgetReservationId !== input.budget.reservationId) throw new Error("UNDERSTANDING_CAPABILITY_STALE");
  if (input.capability.riskProfileFingerprint !== input.riskProfile.fingerprint) throw new Error("UNDERSTANDING_RISK_PROFILE_STALE");
  const now = new Date().toISOString();
  const { snapshot } = await executeDeterministicUnderstanding(input);
  const runId = `understanding-run-${input.manifest.sourceFingerprint.slice(0, 16)}`;
  const run: UnderstandingRun = {
    schemaVersion: "understanding-run.v1",
    runId,
    projectSlug: input.projectSlug,
    status: "completed",
    executionMode: "shadow",
    sourceFingerprint: input.manifest.sourceFingerprint,
    riskProfileFingerprint: input.riskProfile.fingerprint,
    budgetReservationId: input.budget.reservationId,
    capabilityAuthorizationFingerprint: input.capability.fingerprint,
    snapshotId: snapshot.snapshotId,
    modelCallIssued: false,
    canonWritten: false,
    createdAt: now,
    completedAt: new Date().toISOString()
  };
  await writeJson(input.root, `sessions/understanding-runs/${runId}.json`, run);
  return { run, snapshot };
}

export async function readUnderstandingSnapshot(root: string): Promise<UnderstandingSnapshot | null> {
  try {
    return assertUnderstandingSnapshotIntegrity(JSON.parse(await fs.readFile(resolveInside(root, "sessions/understanding-snapshot.json"), "utf8")) as UnderstandingSnapshot);
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null;
    throw error;
  }
}
