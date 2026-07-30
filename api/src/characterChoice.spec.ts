import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createCharacterDramaticContract } from "./characterContract.js";
import { recordCharacterStateSnapshot } from "./characterState.js";
import { createCharacterChoiceEvidence, observeCharacterChoiceEvidence, readCharacterChoiceEvidence } from "./characterChoice.js";

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "character-choice-"));
  const contract = await createCharacterDramaticContract({ root, projectSlug: "demo", characterId: "hero", displayName: "Hero", externalWant: "escape", internalNeed: "trust", falseBelief: "trust is weakness", woundOrFear: "abandonment", valuesAndBoundaries: ["protect"], contradiction: "freedom/control", stake: "team", unacceptableChoice: "betray", potentialChange: "accept help", unknown: ["final loyalty"], sources: [{ field: "falseBelief", provenance: "inference", sourceVersion: "model-1", evidenceRefs: ["inference://1"] }] });
  const before = await recordCharacterStateSnapshot({ root, projectSlug: "demo", characterId: "hero", contractId: contract.contractId, asOf: "chapter-1:start", currentGoal: "leave", priority: "high", belief: "unsafe", knowledge: [], emotion: "fear", injury: "none", resources: ["key"], abilitiesAndIdentity: ["scout"], relationshipStances: [], obligations: ["warn"], availableChoices: ["flee", "warn"], sourceRefs: ["chapter://1#start"] });
  return { root, contract, before };
}

describe("character choice evidence", () => {
  it("keeps planned choice separate from observed state change", async () => {
    const { root, contract, before } = await fixture();
    const evidence = await createCharacterChoiceEvidence({ root, projectSlug: "demo", characterId: "hero", contractId: contract.contractId, beforeSnapshotId: before.snapshotId, choice: "warn", rejectedChoices: ["flee"], immediateCost: "lose escape window", delayedCost: "enemy learns route", evidenceRefs: ["chapter://1#scene-3"] });
    expect(evidence.status).toBe("planned");
    expect(evidence.afterSnapshotId).toBeUndefined();
    expect(await readCharacterChoiceEvidence(root, evidence.evidenceId)).toEqual(evidence);
  });

  it("observes an outcome only with a real after snapshot and preserves idempotency", async () => {
    const { root, contract, before } = await fixture();
    const planned = await createCharacterChoiceEvidence({ root, projectSlug: "demo", characterId: "hero", contractId: contract.contractId, beforeSnapshotId: before.snapshotId, choice: "warn", rejectedChoices: ["flee"], immediateCost: "lose window", delayedCost: "route exposed", evidenceRefs: ["chapter://1#scene-3"] });
    const after = await recordCharacterStateSnapshot({ root, projectSlug: "demo", characterId: "hero", contractId: contract.contractId, asOf: "chapter-1:end", currentGoal: "protect ally", priority: "high", belief: "ally may trust me", knowledge: ["route exposed"], emotion: "resolved", injury: "none", resources: ["key"], abilitiesAndIdentity: ["scout"], relationshipStances: [], obligations: ["protect ally"], availableChoices: ["hide"], sourceRefs: ["chapter://1#end"] });
    const observed = await observeCharacterChoiceEvidence({ root, evidenceId: planned.evidenceId, afterSnapshotId: after.snapshotId, outcomeRefs: ["chapter://1#end"] });
    expect(observed.status).toBe("observed");
    expect(observed.afterSnapshotId).toBe(after.snapshotId);
    expect(await observeCharacterChoiceEvidence({ root, evidenceId: planned.evidenceId, afterSnapshotId: after.snapshotId, outcomeRefs: ["chapter://1#end"] })).toEqual(observed);
  });

  it("fails closed for an unknown before snapshot or empty costs", async () => {
    const { root, contract } = await fixture();
    await expect(createCharacterChoiceEvidence({ root, projectSlug: "demo", characterId: "hero", contractId: contract.contractId, beforeSnapshotId: "missing", choice: "warn", rejectedChoices: [], immediateCost: "now", delayedCost: "later", evidenceRefs: ["chapter://1"] })).rejects.toThrow("CHARACTER_STATE_SNAPSHOT_NOT_FOUND");
    const before = await recordCharacterStateSnapshot({ root, projectSlug: "demo", characterId: "hero", contractId: contract.contractId, asOf: "chapter-1:start", currentGoal: "leave", priority: "high", belief: "unsafe", knowledge: [], emotion: "fear", injury: "none", resources: [], abilitiesAndIdentity: [], relationshipStances: [], obligations: [], availableChoices: ["warn"], sourceRefs: ["chapter://1"] });
    await expect(createCharacterChoiceEvidence({ root, projectSlug: "demo", characterId: "hero", contractId: contract.contractId, beforeSnapshotId: before.snapshotId, choice: "warn", rejectedChoices: [], immediateCost: "", delayedCost: "later", evidenceRefs: ["chapter://1"] })).rejects.toThrow("CHARACTER_CHOICE_COST_REQUIRED");
  });

  it("requires the selected option to be visible and an actual after-state change", async () => {
    const { root, contract, before } = await fixture();
    await expect(createCharacterChoiceEvidence({ root, projectSlug: "demo", characterId: "hero", contractId: contract.contractId, beforeSnapshotId: before.snapshotId, choice: "invent a portal", rejectedChoices: [], immediateCost: "now", delayedCost: "later", evidenceRefs: ["chapter://1"] })).rejects.toThrow("CHARACTER_CHOICE_NOT_VISIBLE");
    const planned = await createCharacterChoiceEvidence({ root, projectSlug: "demo", characterId: "hero", contractId: contract.contractId, beforeSnapshotId: before.snapshotId, choice: "warn", rejectedChoices: ["flee"], immediateCost: "window", delayedCost: "route exposed", evidenceRefs: ["chapter://1"] });
    await expect(observeCharacterChoiceEvidence({ root, evidenceId: planned.evidenceId, afterSnapshotId: before.snapshotId, outcomeRefs: ["chapter://1"] })).rejects.toThrow("CHARACTER_CHOICE_STATE_CHANGE_REQUIRED");
  });
});
