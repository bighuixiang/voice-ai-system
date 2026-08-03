import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { attachQualityReportEvidence } from "./qualityReportEvidence.js";
import { assertQualityGateCurrent, evaluateQualityGate, persistQualityGateDecision, readQualityGateDecision } from "./qualityGateDecision.js";
import type { ChapterQualityReport } from "./types.js";

const baseReport: ChapterQualityReport = { chapterId: "c1", overallScore: 92, summary: "strong", metrics: [], strengths: ["voice"], fixes: [], updatedAt: "2026-07-31T00:00:00.000Z" };
function report() { return attachQualityReportEvidence(baseReport, { content: "chapter", sourceFingerprint: "canon-1", evaluatorVersion: "quality-review.v1", mode: "hybrid" }); }
const common = () => ({ projectSlug: "demo", report: report(), content: "chapter", sourceFingerprint: "canon-1", riskTier: "ordinary" as const, hardGuards: { canon: true, pov: true }, authorObjectiveSupported: true, protectedStrengthsPreserved: true, independentEvidenceRequired: false, authorizationRef: "author-decision-1", evidenceRefs: ["review://1"] });

describe("quality gate decision", () => {
  it("blocks hard-guard failures regardless of score", () => {
    const decision = evaluateQualityGate({ ...common(), hardGuards: { canon: false, pov: true } });
    expect(decision).toMatchObject({ status: "blocked", hardGuardFailures: ["canon"] });
  });

  it("keeps missing key independent evidence conditional and preserves disagreement", () => {
    const conditional = evaluateQualityGate({ ...common(), riskTier: "key", independentEvidenceRequired: true });
    expect(conditional.status).toBe("conditional");
    const disputed = evaluateQualityGate({ ...common(), independentEvidenceRequired: true, independentEvidencePassed: true, disagreements: ["reader-disagrees"] });
    expect(disputed).toMatchObject({ status: "disputed", disagreements: ["reader-disagrees"] });
  });

  it("marks changed content stale and only passes current evidence", () => {
    const stale = evaluateQualityGate({ ...common(), content: "changed" });
    expect(stale.status).toBe("stale");
    const passed = evaluateQualityGate(common());
    expect(passed.status).toBe("passed");
  });

  it("persists atomically, rejects tampering, and revalidates scope and freshness", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "quality-gate-"));
    const decision = evaluateQualityGate(common());
    await expect(persistQualityGateDecision(root, decision)).resolves.toEqual(decision);
    await expect(assertQualityGateCurrent(root, decision.decisionId, { projectSlug: "demo", chapterId: "c1", content: "chapter", sourceFingerprint: "canon-1" })).resolves.toEqual(decision);
    await expect(assertQualityGateCurrent(root, decision.decisionId, { projectSlug: "other", chapterId: "c1", content: "chapter", sourceFingerprint: "canon-1" })).rejects.toThrow("QUALITY_GATE_SCOPE_MISMATCH");
    await expect(assertQualityGateCurrent(root, decision.decisionId, { projectSlug: "demo", chapterId: "c1", content: "changed", sourceFingerprint: "canon-1" })).rejects.toThrow("QUALITY_GATE_STALE");
    const file = path.join(root, "sessions", "quality-gates", `${decision.decisionId}.json`);
    const tampered = JSON.parse(await fs.readFile(file, "utf8")); tampered.status = "waived";
    await fs.writeFile(file, JSON.stringify(tampered), "utf8");
    await expect(readQualityGateDecision(root, decision.decisionId)).rejects.toThrow("QUALITY_GATE_INTEGRITY_FAILED");
  });

  it("fails closed when a quality decision has a valid hash but an invalid status", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "quality-gate-semantic-integrity-"));
    const decision = evaluateQualityGate(common());
    await persistQualityGateDecision(root, decision);
    const file = path.join(root, "sessions", "quality-gates", `${decision.decisionId}.json`);
    const tampered = JSON.parse(await fs.readFile(file, "utf8")) as Record<string, unknown>;
    tampered.status = "committed";
    delete tampered.fingerprint;
    await fs.writeFile(file, JSON.stringify({ ...tampered, fingerprint: crypto.createHash("sha256").update(JSON.stringify(tampered)).digest("hex") }), "utf8");
    await expect(readQualityGateDecision(root, decision.decisionId)).rejects.toThrow("QUALITY_GATE_INTEGRITY_FAILED");
  });
});
