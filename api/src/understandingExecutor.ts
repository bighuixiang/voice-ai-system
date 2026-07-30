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

async function writeJson(root: string, relativePath: string, value: unknown): Promise<void> {
  const target = resolveInside(root, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temp, target);
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
  const preview = buildUnderstandingPreview(input.session);
  const now = new Date().toISOString();
  const snapshotId = `understanding-shadow-${input.manifest.sourceFingerprint.slice(0, 16)}`;
  const snapshot: UnderstandingSnapshot = {
    schemaVersion: "understanding-snapshot.v1",
    snapshotId,
    projectSlug: input.projectSlug,
    mode: "shadow",
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
    createdAt: now
  };
  await writeJson(input.root, "sessions/understanding-snapshot.json", snapshot);
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
    snapshotId,
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
    return JSON.parse(await fs.readFile(resolveInside(root, "sessions/understanding-snapshot.json"), "utf8")) as UnderstandingSnapshot;
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null;
    throw error;
  }
}
