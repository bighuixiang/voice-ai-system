import { describe, expect, it } from "vitest";
import { createModelInvocationRecord } from "./modelInvocationLedger.js";
import { decideCapabilityUpgrade, evaluateProviderRun } from "./providerEvaluation.js";
import crypto from "node:crypto";

const record = (id: string, startedAt: string, finishedAt: string, status: "completed" | "failed" = "completed") => createModelInvocationRecord({ invocationId: id, taskId: id, taskFingerprint: `task-${id}`, attemptId: `attempt-${id}`, routeDecision: "balanced", modelCapabilityRef: "provider://mock-v1", contextManifestRef: "manifest-1", promptSchemaVersion: "prompt.v1", startedAt, finishedAt, status, usage: { inputTokens: 10, outputTokens: 5, cachedTokens: 0, measurement: "actual" }, cost: { amount: 0.01, currency: "USD", measurement: "actual" }, cache: { hit: false }, adoptionDecision: "not-adopted" });
const trustedCalibration = () => {
  const base = { schemaVersion: "quality-calibration-evidence.v1", calibrationId: "cal-1", evaluatorVersion: "provider-v1", sourceKind: "provider", split: "holdout", caseIds: [], inputFingerprint: "holdout-1", evaluatedCount: 10, correctCount: 9, accuracy: 0.9, minimumAccuracy: 0.8, status: "calibrated", canonGateEligible: false, labelAccess: "sealed-separate-from-evaluator-input", attestation: { kind: "provider-signed", reference: "attestation://provider/1" }, evidenceRefs: ["audit://provider/1"], createdAt: "2026-01-01T00:00:00.000Z" } as const;
  return { ...base, fingerprint: crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex") };
};

describe("provider evaluation", () => {
  it("joins quality, actual cost, effective output rate, and latency into a gated report", () => {
    const report = evaluateProviderRun({ providerRef: "provider://mock-v1", records: [record("1", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.100Z"), record("2", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.300Z", "failed")], qualityEvidence: trustedCalibration(), maxP95LatencyMs: 500, maxCost: 1 });
    expect(report).toMatchObject({ schemaVersion: "provider-evaluation-report.v1", invocationCount: 2, completedCount: 1, effectiveOutputRate: 0.5, totalCost: { amount: 0.02, measurement: "actual" }, latencyMs: { p50: 100, p95: 300 }, quality: { status: "calibrated", accuracy: 0.9 }, decision: "pass" });
    expect(report.fingerprint).toHaveLength(64);
  });

  it("blocks a provider when quality is missing or latency/cost thresholds fail", () => {
    const report = evaluateProviderRun({ providerRef: "provider://mock-v1", records: [record("1", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:02.000Z")], maxP95LatencyMs: 1000, maxCost: 0.001 });
    expect(report).toMatchObject({ decision: "blocked", blockedReasons: ["QUALITY_NOT_CALIBRATED", "P95_LATENCY_EXCEEDED", "COST_EXCEEDED"] });
  });

  it("does not treat estimated probe usage as real-provider release evidence", () => {
    const estimated = createModelInvocationRecord({
      invocationId: "estimated-1",
      taskId: "estimated-1",
      taskFingerprint: "task-estimated-1",
      attemptId: "attempt-estimated-1",
      routeDecision: "probe",
      modelCapabilityRef: "provider://mock-v1",
      contextManifestRef: "manifest-1",
      promptSchemaVersion: "prompt.v1",
      startedAt: "2026-01-01T00:00:00.000Z",
      finishedAt: "2026-01-01T00:00:00.100Z",
      status: "completed",
      usage: { inputTokens: 10, outputTokens: 5, cachedTokens: 0, measurement: "estimated" },
      cost: { amount: 0.01, currency: "USD", measurement: "estimated", estimateMethod: "probe" },
      cache: { hit: false },
      adoptionDecision: "probe-only"
    });
    const report = evaluateProviderRun({
      providerRef: "provider://mock-v1",
      records: [estimated],
      qualityEvidence: trustedCalibration(),
      maxP95LatencyMs: 500,
      maxCost: 1
    });
    expect(report.decision).toBe("blocked");
    expect(report.blockedReasons).toContain("ACTUAL_USAGE_REQUIRED");
  });

  it("does not trust a caller-supplied calibrated label without a valid evidence artifact", () => {
    const report = evaluateProviderRun({
      providerRef: "provider://mock-v1",
      records: [record("untrusted", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.100Z")],
      qualityEvidence: { status: "calibrated", canonGateEligible: false, calibrationId: "forged", accuracy: 1 } as any,
      maxP95LatencyMs: 500,
      maxCost: 1
    });
    expect(report.decision).toBe("blocked");
    expect(report.blockedReasons).toContain("QUALITY_EVIDENCE_INVALID");
  });
  it("requires isolated evidence before upgrading capability", () => { const blocked = evaluateProviderRun({ providerRef: "provider://mock-v1", records: [record("upgrade", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:02.000Z")], maxP95LatencyMs: 1000, maxCost: 0.001 }); const hold = decideCapabilityUpgrade({ report: blocked, evidenceRefs: [], contextIntact: true, contractIntact: true }); expect(hold.status).toBe("hold"); expect(hold.blockedBy).toContain("EVIDENCE_REQUIRED"); const upgrade = decideCapabilityUpgrade({ report: blocked, evidenceRefs: ["eval://provider-failure"], contextIntact: true, contractIntact: true }); expect(upgrade.status).toBe("upgrade"); const contextDefect = decideCapabilityUpgrade({ report: blocked, evidenceRefs: ["eval://provider-failure"], contextIntact: false, contractIntact: true }); expect(contextDefect.status).toBe("hold"); });
});
