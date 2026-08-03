import crypto from "node:crypto";
import type { ModelInvocationRecord } from "./modelInvocationLedger.js";
import { isQualityCalibrationEvidenceTrusted, type QualityCalibrationEvidence } from "./qualityCalibration.js";

export interface ProviderEvaluationReport {
  schemaVersion: "provider-evaluation-report.v1";
  providerRef: string;
  invocationCount: number;
  completedCount: number;
  effectiveOutputRate: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: { amount: number; currency: string; measurement: "actual" | "estimated" | "mixed" };
  latencyMs: { p50: number; p95: number; max: number };
  quality: { status: "calibrated" | "blocked" | "missing"; accuracy?: number; evidenceRef?: string };
  decision: "pass" | "blocked";
  blockedReasons: string[];
  fingerprint: string;
}
export interface CapabilityUpgradeDecision { schemaVersion: "capability-upgrade-decision.v1"; status: "upgrade" | "hold"; reason: string; evidenceRefs: string[]; blockedBy: string[]; fingerprint: string; }

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)];
}
export function decideCapabilityUpgrade(input: { report: ProviderEvaluationReport; evidenceRefs: readonly string[]; contextIntact: boolean; contractIntact: boolean }): CapabilityUpgradeDecision { const blockedBy: string[] = []; if (!input.evidenceRefs.length || input.evidenceRefs.some((ref) => !ref.trim())) blockedBy.push("EVIDENCE_REQUIRED"); if (!input.contextIntact) blockedBy.push("CONTEXT_DEFECT_NOT_MODEL_DEFECT"); if (!input.contractIntact) blockedBy.push("CONTRACT_DEFECT_NOT_MODEL_DEFECT"); if (input.report.decision !== "blocked") blockedBy.push("NO_UPGRADE_TRIGGER"); const base = { schemaVersion: "capability-upgrade-decision.v1" as const, status: blockedBy.length ? "hold" as const : "upgrade" as const, reason: blockedBy.length ? "capability upgrade is not justified by isolated evidence" : "isolated provider failure evidence justifies trying a stronger capability", evidenceRefs: [...input.evidenceRefs], blockedBy }; return { ...base, fingerprint: crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex") }; }

export function evaluateProviderRun(input: {
  providerRef: string;
  records: ModelInvocationRecord[];
  qualityEvidence?: QualityCalibrationEvidence | null;
  maxP95LatencyMs: number;
  maxCost: number;
}): ProviderEvaluationReport {
  if (!input.providerRef.trim()) throw new Error("PROVIDER_EVALUATION_PROVIDER_REQUIRED");
  if (!input.records.length) throw new Error("PROVIDER_EVALUATION_RECORDS_REQUIRED");
  if (!Number.isFinite(input.maxP95LatencyMs) || input.maxP95LatencyMs < 0 || !Number.isFinite(input.maxCost) || input.maxCost < 0) throw new Error("PROVIDER_EVALUATION_THRESHOLDS_INVALID");
  const records = input.records.filter((record) => record.modelCapabilityRef === input.providerRef);
  if (!records.length) throw new Error("PROVIDER_EVALUATION_PROVIDER_NOT_FOUND");
  const completed = records.filter((record) => record.status === "completed");
  const latencies = records.map((record) => Math.max(0, Date.parse(record.finishedAt) - Date.parse(record.startedAt))).filter(Number.isFinite);
  const currencies = new Set(records.map((record) => record.cost.currency));
  if (currencies.size !== 1) throw new Error("PROVIDER_EVALUATION_CURRENCY_MISMATCH");
  const totalCost = records.reduce((sum, record) => sum + record.cost.amount, 0);
  const measurement: ProviderEvaluationReport["totalCost"]["measurement"] = records.every((record) => record.cost.measurement === "actual") ? "actual" : records.every((record) => record.cost.measurement === "estimated") ? "estimated" : "mixed";
  const qualityEvidenceTrusted = isQualityCalibrationEvidenceTrusted(input.qualityEvidence);
  const qualityStatus: ProviderEvaluationReport["quality"]["status"] = qualityEvidenceTrusted ? input.qualityEvidence!.status : input.qualityEvidence ? "blocked" : "missing";
  const blockedReasons: string[] = [];
  if (records.some((record) => record.usage.measurement !== "actual" || record.cost.measurement !== "actual")) blockedReasons.push("ACTUAL_USAGE_REQUIRED");
  if (qualityStatus !== "calibrated") blockedReasons.push("QUALITY_NOT_CALIBRATED");
  if (input.qualityEvidence && !qualityEvidenceTrusted) blockedReasons.push("QUALITY_EVIDENCE_INVALID");
  if (percentile(latencies, 0.95) > input.maxP95LatencyMs) blockedReasons.push("P95_LATENCY_EXCEEDED");
  if (totalCost > input.maxCost) blockedReasons.push("COST_EXCEEDED");
  const base = {
    schemaVersion: "provider-evaluation-report.v1" as const,
    providerRef: input.providerRef,
    invocationCount: records.length,
    completedCount: completed.length,
    effectiveOutputRate: completed.length / records.length,
    totalInputTokens: records.reduce((sum, record) => sum + record.usage.inputTokens, 0),
    totalOutputTokens: records.reduce((sum, record) => sum + record.usage.outputTokens, 0),
    totalCost: { amount: totalCost, currency: [...currencies][0], measurement },
    latencyMs: { p50: percentile(latencies, 0.5), p95: percentile(latencies, 0.95), max: Math.max(...latencies) },
    quality: { status: qualityStatus, ...(input.qualityEvidence ? { accuracy: input.qualityEvidence.accuracy, evidenceRef: `calibration://${input.qualityEvidence.calibrationId}` } : {}) },
    decision: blockedReasons.length ? "blocked" as const : "pass" as const,
    blockedReasons
  };
  return { ...base, fingerprint: crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex") };
}
