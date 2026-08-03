import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { createCraftPattern, approveCraftPattern, readCraftPattern } from "./craftPattern.js";
import { promoteCraftPatternFromExperiment } from "./craftPatternPromotion.js";
import type { CraftExperiment } from "./craftExperiment.js";
import type { RightsEnvelope } from "./sourceRights.js";

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "craft-promotion-"));
  const envelope: RightsEnvelope = { schemaVersion: "rights-envelope.v1", envelopeId: "rights-1", sourceId: "source-1", projectSlug: "demo", rightsStatus: "owned", allowedUses: ["analysis", "style-experiment"], analysisOnly: false, status: "valid", checkedBy: "author", checkedAt: "2026-07-30T00:00:00.000Z", sourceFingerprint: "source", fingerprint: "rights" };
  await fs.mkdir(path.join(root, "sessions", "rights-envelopes"), { recursive: true });
  await fs.writeFile(path.join(root, "sessions", "rights-envelopes", "rights-1.json"), JSON.stringify(envelope), "utf8");
  const pattern = await createCraftPattern({ root, projectSlug: "demo", name: "Scoped rhythm", mechanism: "shorten turns", narrativeFunction: "speed", applicability: ["chase"], counterexamples: [], sourceEnvelopeIds: [envelope.envelopeId], evidenceRefs: ["source://one"] });
  const approved = await approveCraftPattern({ root, patternId: pattern.patternId, actor: "author", reason: "Scoped" });
  return { root, approved };
}
function experiment(status: CraftExperiment["status"], winner: "baseline" | "treatment" | "tie" | "uncertain", hardGuardsPassed: boolean, withDecision = true): CraftExperiment { return { schemaVersion: "craft-experiment.v1", experimentId: "experiment-1", projectSlug: "demo", transferPlanId: "plan-1", baselineCandidateId: "base", treatmentCandidateId: "treatment", holdoutSceneIds: ["scene-1"], targetMetrics: ["pressure"], budgetId: "budget-1", status, judgment: status === "judged" || status === "failed" ? { evaluatorId: "reviewer", evaluatorKind: "independent-reviewer", winner, hardGuardsPassed, authorReason: "Reviewed", judgedAt: "2026-07-30T00:00:00.000Z", fingerprint: "judgment" } : undefined, decision: withDecision ? { actor: "author", decision: "adopt", reason: "Author approved", decidedAt: "2026-07-30T00:00:00.000Z" } : undefined, createdAt: "2026-07-30T00:00:00.000Z", updatedAt: "2026-07-30T00:00:00.000Z", fingerprint: "experiment" }; }

describe("craft pattern promotion", () => {
  it("moves an approved pattern to probation only after a successful independent experiment", async () => {
    const { root, approved } = await fixture();
    const promoted = await promoteCraftPatternFromExperiment({ root, patternId: approved.patternId, experiment: experiment("judged", "treatment", true), actor: "author", reason: "Holdout preserved pressure." });
    expect(promoted.lifecycle).toBe("probation");
    expect(promoted.promotion).toMatchObject({ experimentId: "experiment-1", actor: "author" });
  });

  it("does not promote on failed, baseline-winning, or unapproved evidence", async () => {
    const { root, approved } = await fixture();
    await expect(promoteCraftPatternFromExperiment({ root, patternId: approved.patternId, experiment: experiment("failed", "treatment", false), actor: "author", reason: "Guard failed" })).rejects.toThrow("CRAFT_PATTERN_PROMOTION_BLOCKED");
    await expect(promoteCraftPatternFromExperiment({ root, patternId: approved.patternId, experiment: experiment("judged", "baseline", true), actor: "author", reason: "Baseline wins" })).rejects.toThrow("CRAFT_PATTERN_PROMOTION_BLOCKED");
    const candidateBase = { ...approved, lifecycle: "candidate" as const };
    const { fingerprint: _fingerprint, ...candidateWithoutFingerprint } = candidateBase;
    const candidate = { ...candidateBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(candidateWithoutFingerprint)).digest("hex") };
    await fs.writeFile(path.join(root, "sessions", "craft-patterns", `${candidate.patternId}.json`), JSON.stringify(candidate), "utf8");
    await expect(promoteCraftPatternFromExperiment({ root, patternId: candidate.patternId, experiment: experiment("judged", "treatment", true), actor: "author", reason: "Not approved" })).rejects.toThrow("CRAFT_PATTERN_APPROVAL_REQUIRED");
    expect((await readCraftPattern(root, candidate.patternId))?.lifecycle).toBe("candidate");
  });

  it("requires an explicit author adopt decision in addition to the independent judgment", async () => {
    const { root, approved } = await fixture();
    await expect(promoteCraftPatternFromExperiment({ root, patternId: approved.patternId, experiment: experiment("judged", "treatment", true, false), actor: "author", reason: "Holdout preserved pressure." })).rejects.toThrow("CRAFT_PATTERN_AUTHOR_ADOPTION_REQUIRED");
  });

  it("does not use an uncalibrated reader review as a promotion gate", async () => {
    const { root, approved } = await fixture();
    const candidate = { ...experiment("judged", "treatment", true), readerCalibration: { schemaVersion: "reader-reviewer.v1" as const, reviewerId: "reader-1", status: "experimental" as const, humanSamples: 1, blind: false, agreementRate: 0.2, fingerprint: "reader" } };
    await expect(promoteCraftPatternFromExperiment({ root, patternId: approved.patternId, experiment: candidate, actor: "author", reason: "Reader evidence must be calibrated." })).rejects.toThrow("CRAFT_PATTERN_PROMOTION_READER_CALIBRATION_REQUIRED");
  });
});
