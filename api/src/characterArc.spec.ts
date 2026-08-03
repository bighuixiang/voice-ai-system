import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createCharacterDramaticContract } from "./characterContract.js";
import { createCharacterArcContract, listCharacterArcContracts, readCharacterArcContract, recordCharacterArcMilestone } from "./characterArc.js";
import { createCharacterChoiceEvidence, observeCharacterChoiceEvidence } from "./characterChoice.js";
import { recordCharacterStateSnapshot } from "./characterState.js";
import crypto from "node:crypto";

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "character-arc-"));
  const contract = await createCharacterDramaticContract({ root, projectSlug: "demo", characterId: "hero", displayName: "Hero", externalWant: "escape", internalNeed: "trust", falseBelief: "trust is weakness", woundOrFear: "abandonment", valuesAndBoundaries: ["protect"], contradiction: "freedom/control", stake: "team", unacceptableChoice: "betray", potentialChange: "accept help", unknown: ["final loyalty"], sources: [{ field: "falseBelief", provenance: "inference", sourceVersion: "model-1", evidenceRefs: ["inference://1"] }] });
  const before = await recordCharacterStateSnapshot({ root, projectSlug: "demo", characterId: "hero", contractId: contract.contractId, asOf: "chapter-1:start", currentGoal: "leave", priority: "high", belief: "unsafe", knowledge: [], emotion: "fear", injury: "none", resources: [], abilitiesAndIdentity: ["scout"], relationshipStances: [], obligations: [], availableChoices: ["warn"], sourceRefs: ["chapter://1#start"] });
  const after = await recordCharacterStateSnapshot({ root, projectSlug: "demo", characterId: "hero", contractId: contract.contractId, asOf: "chapter-1:end", currentGoal: "protect ally", priority: "high", belief: "ally may trust me", knowledge: [], emotion: "resolved", injury: "none", resources: [], abilitiesAndIdentity: ["scout"], relationshipStances: [], obligations: ["protect ally"], availableChoices: ["warn"], sourceRefs: ["chapter://1#end"] });
  const choice = await createCharacterChoiceEvidence({ root, projectSlug: "demo", characterId: "hero", contractId: contract.contractId, beforeSnapshotId: before.snapshotId, choice: "warn", rejectedChoices: [], immediateCost: "lose window", delayedCost: "route exposed", evidenceRefs: ["chapter://1#scene"] });
  const observedChoice = await observeCharacterChoiceEvidence({ root, evidenceId: choice.evidenceId, afterSnapshotId: after.snapshotId, outcomeRefs: ["chapter://1#end"] });
  return { root, contract, before, after, observedChoice };
}

describe("character arc contract", () => {
  it("keeps planned arc separate from observed milestones", async () => {
    const { root, contract } = await fixture();
    const arc = await createCharacterArcContract({ root, projectSlug: "demo", characterId: "hero", dramaticContractId: contract.contractId, startState: "isolated and suspicious", targetChange: "accept reciprocal trust", keyPressures: ["betrayal risk"], plannedChoices: ["warn ally"], plannedCosts: ["lose escape window"], relationshipImpacts: ["trust ally"], allowedRegression: "fear may return after betrayal", sourceRefs: ["plan://arc-1"] });
    expect(arc.lifecycle).toBe("planned");
    expect(arc.milestones).toEqual([]);
    expect(await readCharacterArcContract(root, arc.arcId)).toEqual(arc);
  });

  it("records a milestone only from observed choice evidence and is idempotent", async () => {
    const { root, contract, observedChoice } = await fixture();
    const arc = await createCharacterArcContract({ root, projectSlug: "demo", characterId: "hero", dramaticContractId: contract.contractId, startState: "isolated", targetChange: "trust", keyPressures: ["risk"], plannedChoices: ["warn"], plannedCosts: ["window"], relationshipImpacts: ["ally trust"], allowedRegression: "fear", sourceRefs: ["plan://arc-1"] });
    const updated = await recordCharacterArcMilestone({ root, arcId: arc.arcId, choiceEvidenceId: observedChoice.evidenceId, milestone: "chooses ally over escape", actualChange: "protects ally", sourceRefs: ["chapter://1#end"] });
    expect(updated.milestones[0].choiceEvidenceId).toBe(observedChoice.evidenceId);
    expect(await recordCharacterArcMilestone({ root, arcId: arc.arcId, choiceEvidenceId: observedChoice.evidenceId, milestone: "chooses ally over escape", actualChange: "protects ally", sourceRefs: ["chapter://1#end"] })).toEqual(updated);
  });

  it("rejects a plan without evidence or a milestone from planned choice", async () => {
    const { root, contract } = await fixture();
    await expect(createCharacterArcContract({ root, projectSlug: "demo", characterId: "hero", dramaticContractId: contract.contractId, startState: "", targetChange: "trust", keyPressures: [], plannedChoices: [], plannedCosts: [], relationshipImpacts: [], allowedRegression: "fear", sourceRefs: [] })).rejects.toThrow("CHARACTER_ARC_SOURCE_REQUIRED");
    const arc = await createCharacterArcContract({ root, projectSlug: "demo", characterId: "hero", dramaticContractId: contract.contractId, startState: "isolated", targetChange: "trust", keyPressures: ["risk"], plannedChoices: ["warn"], plannedCosts: ["window"], relationshipImpacts: ["ally trust"], allowedRegression: "fear", sourceRefs: ["plan://arc-1"] });
    await expect(recordCharacterArcMilestone({ root, arcId: arc.arcId, choiceEvidenceId: "missing", milestone: "growth", actualChange: "change", sourceRefs: ["chapter://1"] })).rejects.toThrow("CHARACTER_CHOICE_EVIDENCE_NOT_FOUND");
  });

  it("fails closed when a re-signed arc contains duplicate milestone identities", async () => {
    const { root, contract, observedChoice } = await fixture();
    const arc = await createCharacterArcContract({ root, projectSlug: "demo", characterId: "hero", dramaticContractId: contract.contractId, startState: "isolated", targetChange: "trust", keyPressures: ["risk"], plannedChoices: ["warn"], plannedCosts: ["window"], relationshipImpacts: [], allowedRegression: "fear", sourceRefs: ["plan://arc-1"] });
    const updated = await recordCharacterArcMilestone({ root, arcId: arc.arcId, choiceEvidenceId: observedChoice.evidenceId, milestone: "growth", actualChange: "trusts ally", sourceRefs: ["chapter://1"] });
    const target = path.join(root, "sessions", "character-arcs", `${updated.arcId}.json`);
    const { fingerprint: _old, ...base } = JSON.parse(await fs.readFile(target, "utf8")) as Record<string, unknown>;
    const milestones = base.milestones as Array<Record<string, unknown>>;
    const resigned = { ...base, milestones: [...milestones, { ...milestones[0], milestoneId: "milestone-duplicate", choiceEvidenceId: milestones[0].choiceEvidenceId }] };
    resigned.fingerprint = crypto.createHash("sha256").update(JSON.stringify(resigned)).digest("hex");
    await fs.writeFile(target, JSON.stringify(resigned), "utf8");
    await expect(readCharacterArcContract(root, updated.arcId)).rejects.toThrow("CHARACTER_ARC_INTEGRITY_FAILED");
  });
});
