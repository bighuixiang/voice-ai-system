import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { approveCraftPattern, createCraftPattern } from "./craftPattern.js";
import { promoteCraftPatternFromExperiment } from "./craftPatternPromotion.js";
import { validateCraftPatternFromExperiment } from "./craftPatternValidation.js";
import type { CraftExperiment } from "./craftExperiment.js";
import type { RightsEnvelope } from "./sourceRights.js";

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "craft-validation-"));
  const envelope: RightsEnvelope = { schemaVersion: "rights-envelope.v1", envelopeId: "rights-1", sourceId: "source-1", projectSlug: "demo", rightsStatus: "owned", allowedUses: ["analysis", "style-experiment"], analysisOnly: false, status: "valid", checkedBy: "author", checkedAt: "2026-07-30T00:00:00.000Z", sourceFingerprint: "source", fingerprint: "rights" };
  await fs.mkdir(path.join(root, "sessions", "rights-envelopes"), { recursive: true });
  await fs.writeFile(path.join(root, "sessions", "rights-envelopes", "rights-1.json"), JSON.stringify(envelope), "utf8");
  const pattern = await createCraftPattern({ root, projectSlug: "demo", name: "Scoped rhythm", mechanism: "shorten turns", narrativeFunction: "speed", applicability: ["chase"], counterexamples: [], sourceEnvelopeIds: [envelope.envelopeId], evidenceRefs: ["source://one"] });
  const approved = await approveCraftPattern({ root, patternId: pattern.patternId, actor: "author", reason: "Scoped" });
  const first = experiment("experiment-1");
  const probation = await promoteCraftPatternFromExperiment({ root, patternId: approved.patternId, experiment: first, actor: "author", reason: "First holdout" });
  return { root, probation };
}
function experiment(experimentId: string, withDecision = true): CraftExperiment { return { schemaVersion: "craft-experiment.v1", experimentId, projectSlug: "demo", transferPlanId: `plan-${experimentId}`, baselineCandidateId: "base", treatmentCandidateId: "treatment", holdoutSceneIds: [`scene-${experimentId}`], targetMetrics: ["pressure"], budgetId: `budget-${experimentId}`, status: "judged", judgment: { evaluatorId: `reviewer-${experimentId}`, evaluatorKind: "independent-reviewer", winner: "treatment", hardGuardsPassed: true, authorReason: "Holdout improved", judgedAt: "2026-07-30T00:00:00.000Z", fingerprint: `judgment-${experimentId}` }, decision: withDecision ? { actor: "author", decision: "adopt", reason: "Author approved", decidedAt: "2026-07-30T00:00:00.000Z" } : undefined, createdAt: "2026-07-30T00:00:00.000Z", updatedAt: "2026-07-30T00:00:00.000Z", fingerprint: `experiment-${experimentId}` }; }

describe("craft pattern validation", () => {
  it("requires a second independent experiment to validate a probation pattern", async () => {
    const { root, probation } = await fixture();
    const validated = await validateCraftPatternFromExperiment({ root, patternId: probation.patternId, experiment: experiment("experiment-2"), actor: "author", reason: "Second holdout confirms effect" });
    expect(validated.lifecycle).toBe("validated");
    expect(validated.validation).toMatchObject({ experimentId: "experiment-2", actor: "author" });
  });

  it("rejects reusing the promotion experiment or failed evidence and leaves probation intact", async () => {
    const { root, probation } = await fixture();
    await expect(validateCraftPatternFromExperiment({ root, patternId: probation.patternId, experiment: experiment("experiment-1"), actor: "author", reason: "duplicate" })).rejects.toThrow("CRAFT_PATTERN_VALIDATION_SECOND_EXPERIMENT_REQUIRED");
    const failed = { ...experiment("experiment-2"), status: "failed" as const, judgment: { ...experiment("experiment-2").judgment!, hardGuardsPassed: false } };
    await expect(validateCraftPatternFromExperiment({ root, patternId: probation.patternId, experiment: failed, actor: "author", reason: "failed" })).rejects.toThrow("CRAFT_PATTERN_VALIDATION_BLOCKED");
  });
  it("fails closed when the probation pattern is tampered", async () => {
    const { root, probation } = await fixture();
    const target = path.join(root, "sessions", "craft-patterns", `${probation.patternId}.json`);
    await fs.writeFile(target, JSON.stringify({ ...probation, lifecycle: "validated" }), "utf8");
    await expect(validateCraftPatternFromExperiment({ root, patternId: probation.patternId, experiment: experiment("experiment-2"), actor: "author", reason: "Second holdout" })).rejects.toThrow("CRAFT_PATTERN_INTEGRITY_FAILED");
  });
  it("requires author adoption for the independent validation experiment", async () => {
    const { root, probation } = await fixture();
    await expect(validateCraftPatternFromExperiment({ root, patternId: probation.patternId, experiment: experiment("experiment-2", false), actor: "author", reason: "Second holdout" })).rejects.toThrow("CRAFT_PATTERN_AUTHOR_ADOPTION_REQUIRED");
  });
});
