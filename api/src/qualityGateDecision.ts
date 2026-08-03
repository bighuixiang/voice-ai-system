import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { ChapterQualityReport } from "./types.js";
import { assertQualityReportCurrent } from "./qualityReportEvidence.js";
import { resolveInside } from "./pathSafety.js";

export type QualityGateDecisionStatus = "unassessed" | "blocked" | "conditional" | "disputed" | "passed" | "waived" | "stale";
export type QualityGateRiskTier = "ordinary" | "elevated" | "key";

export interface QualityGateDecision {
  schemaVersion: "quality-gate-decision.v1";
  decisionId: string;
  projectSlug: string;
  status: QualityGateDecisionStatus;
  riskTier: QualityGateRiskTier;
  reportChapterId: string;
  reportFingerprint: string;
  sourceFingerprint: string;
  contentSha256: string;
  authorizationRef: string;
  hardGuardFailures: string[];
  missingEvidence: string[];
  disagreements: string[];
  evidenceRefs: string[];
  createdAt: string;
  fingerprint: string;
}

function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }

export function evaluateQualityGate(input: {
  projectSlug: string;
  report: ChapterQualityReport;
  content: string;
  sourceFingerprint: string;
  riskTier: QualityGateRiskTier;
  hardGuards: Record<string, boolean>;
  authorObjectiveSupported: boolean;
  protectedStrengthsPreserved: boolean;
  independentEvidenceRequired: boolean;
  independentEvidencePassed?: boolean;
  disagreements?: string[];
  authorizationRef: string;
  evidenceRefs: string[];
  waiver?: { authorized: boolean; reason: string };
}): QualityGateDecision {
  const disagreements = [...new Set((input.disagreements || []).map((item) => item.trim()).filter(Boolean))].sort();
  const evidenceRefs = [...new Set(input.evidenceRefs.map((item) => item.trim()).filter(Boolean))].sort();
  const hardGuardFailures = Object.entries(input.hardGuards).filter(([, passed]) => !passed).map(([key]) => key).sort();
  const missingEvidence: string[] = [];
  if (!input.authorizationRef.trim()) missingEvidence.push("AUTHOR_AUTHORIZATION_REQUIRED");
  if (!evidenceRefs.length) missingEvidence.push("QUALITY_EVIDENCE_REQUIRED");
  if (!input.authorObjectiveSupported) missingEvidence.push("AUTHOR_OBJECTIVE_UNSUPPORTED");
  if (!input.protectedStrengthsPreserved) hardGuardFailures.push("PROTECTED_STRENGTH_REGRESSION");
  if (input.independentEvidenceRequired && input.independentEvidencePassed !== true) missingEvidence.push("INDEPENDENT_EVIDENCE_REQUIRED");

  let status: QualityGateDecisionStatus = "passed";
  try {
    assertQualityReportCurrent(input.report, { content: input.content, sourceFingerprint: input.sourceFingerprint });
  } catch (error) {
    status = error instanceof Error && error.message === "QUALITY_REPORT_EVIDENCE_REQUIRED" ? "blocked" : "stale";
  }
  if (status === "passed" && hardGuardFailures.length) status = "blocked";
  else if (status === "passed" && disagreements.length) status = "disputed";
  else if (status === "passed" && missingEvidence.length) status = input.independentEvidenceRequired ? "conditional" : "blocked";
  if (status === "passed" && input.waiver?.authorized) status = "waived";
  if (input.waiver?.authorized && !input.waiver.reason.trim()) status = "blocked";
  const base = {
    schemaVersion: "quality-gate-decision.v1" as const,
    decisionId: `quality-gate-${input.projectSlug.trim()}-${input.report.chapterId}-${hash({ projectSlug: input.projectSlug.trim(), report: input.report.evidence, sourceFingerprint: input.sourceFingerprint, riskTier: input.riskTier, status }).slice(0, 16)}`,
    projectSlug: input.projectSlug.trim(),
    status,
    riskTier: input.riskTier,
    reportChapterId: input.report.chapterId,
    reportFingerprint: hash(input.report),
    sourceFingerprint: input.sourceFingerprint.trim(),
    contentSha256: hashText(input.content),
    authorizationRef: input.authorizationRef.trim(),
    hardGuardFailures: [...new Set(hardGuardFailures)].sort(),
    missingEvidence: [...new Set(missingEvidence)].sort(),
    disagreements,
    evidenceRefs,
    createdAt: new Date().toISOString()
  };
  return { ...base, fingerprint: hash(base) };
}

function hashText(value: string): string { return crypto.createHash("sha256").update(value, "utf8").digest("hex"); }
function decisionPath(root: string, decisionId: string): string { return resolveInside(root, `sessions/quality-gates/${decisionId}.json`); }
export function assertQualityGateDecisionIntegrity(decision: QualityGateDecision, decisionId?: string): QualityGateDecision {
  const { fingerprint, ...base } = decision;
  const strings = (values: unknown) => Array.isArray(values) && values.every((value) => typeof value === "string" && value.trim());
  const valid = decision.schemaVersion === "quality-gate-decision.v1" && (decisionId === undefined || decision.decisionId === decisionId) && [decision.decisionId, decision.projectSlug, decision.reportChapterId, decision.reportFingerprint, decision.sourceFingerprint, decision.contentSha256, decision.authorizationRef, decision.createdAt].every((value) => typeof value === "string" && value.trim()) && ["unassessed", "blocked", "conditional", "disputed", "passed", "waived", "stale"].includes(decision.status) && ["ordinary", "elevated", "key"].includes(decision.riskTier) && strings(decision.hardGuardFailures) && strings(decision.missingEvidence) && strings(decision.disagreements) && strings(decision.evidenceRefs);
  if (!valid || Number.isNaN(Date.parse(decision.createdAt)) || !/^[a-f0-9]{64}$/i.test(decision.fingerprint) || hash(base) !== fingerprint) throw new Error("QUALITY_GATE_INTEGRITY_FAILED");
  return decision;
}
async function writeJson(target: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temp, target);
}

export async function persistQualityGateDecision(root: string, decision: QualityGateDecision): Promise<QualityGateDecision> {
  assertQualityGateDecisionIntegrity(decision);
  const existing = await readQualityGateDecision(root, decision.decisionId);
  if (existing) {
    if (existing.fingerprint !== decision.fingerprint) throw new Error("QUALITY_GATE_ID_CONFLICT");
    return existing;
  }
  await writeJson(decisionPath(root, decision.decisionId), decision);
  return decision;
}

export async function readQualityGateDecision(root: string, decisionId: string): Promise<QualityGateDecision | null> {
  try {
    const decision = JSON.parse(await fs.readFile(decisionPath(root, decisionId), "utf8")) as QualityGateDecision;
    assertQualityGateDecisionIntegrity(decision, decisionId);
    return decision;
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null;
    throw error;
  }
}

export async function assertQualityGateCurrent(root: string, decisionId: string, input: {
  projectSlug: string;
  chapterId: string;
  content: string;
  sourceFingerprint: string;
}): Promise<QualityGateDecision> {
  const decision = await readQualityGateDecision(root, decisionId);
  if (!decision) throw new Error("QUALITY_GATE_NOT_FOUND");
  if (decision.projectSlug !== input.projectSlug || decision.reportChapterId !== input.chapterId) throw new Error("QUALITY_GATE_SCOPE_MISMATCH");
  if (decision.status !== "passed" && decision.status !== "waived") throw new Error("QUALITY_GATE_NOT_SETTLED");
  if (decision.contentSha256 !== hashText(input.content) || decision.sourceFingerprint !== input.sourceFingerprint.trim()) throw new Error("QUALITY_GATE_STALE");
  return decision;
}
