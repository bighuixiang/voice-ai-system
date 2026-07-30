import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createCharacterDramaticContract } from "./characterContract.js";
import { listCharacterStateSnapshots, readCharacterStateSnapshot, recordCharacterStateSnapshot } from "./characterState.js";

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "character-state-"));
  const contract = await createCharacterDramaticContract({ root, projectSlug: "demo", characterId: "hero", displayName: "Hero", externalWant: "escape", internalNeed: "trust", falseBelief: "trust is weakness", woundOrFear: "abandonment", valuesAndBoundaries: ["protect"], contradiction: "freedom/control", stake: "team", unacceptableChoice: "betray", potentialChange: "accept help", unknown: ["final loyalty"], sources: [{ field: "falseBelief", provenance: "inference", sourceVersion: "model-1", evidenceRefs: ["inference://1"] }] });
  return { root, contract };
}

describe("character state snapshot", () => {
  it("records multidimensional state with immutable source references", async () => {
    const { root, contract } = await fixture();
    const snapshot = await recordCharacterStateSnapshot({ root, projectSlug: "demo", characterId: contract.characterId, contractId: contract.contractId, asOf: "chapter-1:end", currentGoal: "leave the city", priority: "high", belief: "the team will betray me", knowledge: ["the gate is watched"], emotion: "guarded", injury: "left shoulder wound", resources: ["one key"], abilitiesAndIdentity: ["scout"], relationshipStances: [{ targetCharacterId: "ally", trust: 0.2, power: 0.4, dependency: 0.8, fear: 0.6, publicStance: "ally", privateStance: "suspect", boundary: "no secrets", unpaidDebt: "saved life" }], obligations: ["protect ally"], availableChoices: ["flee", "warn ally"], sourceRefs: ["chapter://1#end"] });
    expect(snapshot.schemaVersion).toBe("character-state-snapshot.v1");
    expect(snapshot.currentState).toBeUndefined();
    expect(snapshot.relationshipStances[0].trust).toBe(0.2);
    expect(await readCharacterStateSnapshot(root, snapshot.snapshotId)).toEqual(snapshot);
  });

  it("is idempotent and lists only the project character", async () => {
    const { root, contract } = await fixture();
    const input = { root, projectSlug: "demo", characterId: contract.characterId, contractId: contract.contractId, asOf: "chapter-1:end", currentGoal: "leave", priority: "high", belief: "unsafe", knowledge: ["gate"], emotion: "fear", injury: "none", resources: ["key"], abilitiesAndIdentity: ["scout"], relationshipStances: [], obligations: ["warn"], availableChoices: ["flee"], sourceRefs: ["chapter://1#end"] } as const;
    const first = await recordCharacterStateSnapshot(input);
    expect(await recordCharacterStateSnapshot(input)).toEqual(first);
    expect(await listCharacterStateSnapshots(root, "other", contract.characterId)).toEqual([]);
    expect(await listCharacterStateSnapshots(root, "demo", contract.characterId)).toHaveLength(1);
  });

  it("requires source refs and a known contract", async () => {
    const { root, contract } = await fixture();
    await expect(recordCharacterStateSnapshot({ root, projectSlug: "demo", characterId: contract.characterId, contractId: contract.contractId, asOf: "chapter-1:end", currentGoal: "leave", priority: "high", belief: "unsafe", knowledge: [], emotion: "fear", injury: "none", resources: [], abilitiesAndIdentity: [], relationshipStances: [], obligations: [], availableChoices: [], sourceRefs: [] })).rejects.toThrow("CHARACTER_STATE_SOURCE_REQUIRED");
    await expect(recordCharacterStateSnapshot({ root, projectSlug: "demo", characterId: contract.characterId, contractId: "missing", asOf: "chapter-2:end", currentGoal: "leave", priority: "high", belief: "unsafe", knowledge: [], emotion: "fear", injury: "none", resources: [], abilitiesAndIdentity: [], relationshipStances: [], obligations: [], availableChoices: ["flee"], sourceRefs: ["chapter://2#end"] })).rejects.toThrow("CHARACTER_CONTRACT_NOT_FOUND");
  });

  it("keeps directed multidimensional relationship states asymmetric", async () => {
    const { root, contract } = await fixture();
    const snapshot = await recordCharacterStateSnapshot({ root, projectSlug: "demo", characterId: contract.characterId, contractId: contract.contractId, asOf: "chapter-2:end", currentGoal: "negotiate", priority: "high", belief: "ally is useful", knowledge: [], emotion: "calm", injury: "none", resources: [], abilitiesAndIdentity: [], relationshipStances: [{ targetCharacterId: "ally", trust: 0.8, intimacy: 0.4, power: 0.2, dependency: 0.3, fear: 0.1, responsibility: 0.9, publicStance: "ally", privateStance: "doubtful", boundary: "no debt", unpaidDebt: "none" }, { targetCharacterId: "rival", trust: 0.1, intimacy: 0.0, power: 0.7, dependency: 0.2, fear: 0.8, responsibility: 0.1, publicStance: "civil", privateStance: "hostile", boundary: "no access", unpaidDebt: "insult" }], obligations: [], availableChoices: ["negotiate"], sourceRefs: ["chapter://2"] });
    expect(snapshot.relationshipStances[0]).toMatchObject({ targetCharacterId: "ally", intimacy: 0.4, responsibility: 0.9 });
    expect(snapshot.relationshipStances[1]).toMatchObject({ targetCharacterId: "rival", trust: 0.1, fear: 0.8 });
  });
});
