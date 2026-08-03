import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createCharacterDramaticContract } from "./characterContract.js";
import { recordCharacterStateSnapshot } from "./characterState.js";
import { createRelationshipEvent, observeRelationshipEvent, readRelationshipEvent } from "./relationshipEvent.js";
import crypto from "node:crypto";

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "relationship-event-"));
  const contract = await createCharacterDramaticContract({ root, projectSlug: "demo", characterId: "hero", displayName: "Hero", externalWant: "escape", internalNeed: "trust", falseBelief: "trust is weakness", woundOrFear: "abandonment", valuesAndBoundaries: ["protect"], contradiction: "freedom/control", stake: "team", unacceptableChoice: "betray", potentialChange: "accept help", unknown: ["final loyalty"], sources: [{ field: "falseBelief", provenance: "inference", sourceVersion: "model-1", evidenceRefs: ["inference://1"] }] });
  const before = await recordCharacterStateSnapshot({ root, projectSlug: "demo", characterId: "hero", contractId: contract.contractId, asOf: "chapter-1:start", currentGoal: "leave", priority: "high", belief: "unsafe", knowledge: [], emotion: "fear", injury: "none", resources: [], abilitiesAndIdentity: ["scout"], relationshipStances: [{ targetCharacterId: "ally", trust: 0.2, power: 0.4, dependency: 0.8, fear: 0.6, publicStance: "ally", privateStance: "suspect", boundary: "no secrets", unpaidDebt: "saved life" }], obligations: [], availableChoices: ["warn", "hide"], sourceRefs: ["chapter://1#start"] });
  const after = await recordCharacterStateSnapshot({ root, projectSlug: "demo", characterId: "hero", contractId: contract.contractId, asOf: "chapter-1:end", currentGoal: "protect ally", priority: "high", belief: "ally may trust me", knowledge: ["route exposed"], emotion: "resolved", injury: "none", resources: [], abilitiesAndIdentity: ["scout"], relationshipStances: [{ targetCharacterId: "ally", trust: 0.6, power: 0.4, dependency: 0.7, fear: 0.3, publicStance: "ally", privateStance: "ally", boundary: "share routes", unpaidDebt: "saved life" }], obligations: ["protect ally"], availableChoices: ["warn"], sourceRefs: ["chapter://1#end"] });
  return { root, contract, before, after };
}

describe("relationship event", () => {
  it("keeps directional interpretations and state transition evidence", async () => {
    const { root, contract, before } = await fixture();
    const event = await createRelationshipEvent({ root, projectSlug: "demo", relationshipId: "hero->ally", sourceCharacterId: "hero", targetCharacterId: "ally", contractId: contract.contractId, beforeSnapshotId: before.snapshotId, sharedEventRef: "chapter://1#scene-3", sourceCharacterChoice: "warn ally", targetCharacterChoice: "accept warning", sourceInterpretation: "ally might betray me", targetInterpretation: "hero finally trusts me", visibleActions: ["hands over route"], valueExchange: "information for protection", immediateCost: "lose escape window", delayedCost: "enemy learns route", evidenceRefs: ["chapter://1#scene-3"] });
    expect(event.status).toBe("planned");
    expect(event.targetInterpretation).toContain("trust");
    expect(await readRelationshipEvent(root, event.eventId)).toEqual(event);
  });

  it("observes only with an after snapshot and is idempotent", async () => {
    const { root, contract, before, after } = await fixture();
    const planned = await createRelationshipEvent({ root, projectSlug: "demo", relationshipId: "hero->ally", sourceCharacterId: "hero", targetCharacterId: "ally", contractId: contract.contractId, beforeSnapshotId: before.snapshotId, sharedEventRef: "chapter://1#scene-3", sourceCharacterChoice: "warn", targetCharacterChoice: "accept", sourceInterpretation: "suspect", targetInterpretation: "hope", visibleActions: ["hands over route"], valueExchange: "information for protection", immediateCost: "window", delayedCost: "route exposed", evidenceRefs: ["chapter://1#scene-3"] });
    const observed = await observeRelationshipEvent({ root, eventId: planned.eventId, afterSnapshotId: after.snapshotId, outcomeRefs: ["chapter://1#end"] });
    expect(observed.status).toBe("observed");
    expect(await observeRelationshipEvent({ root, eventId: planned.eventId, afterSnapshotId: after.snapshotId, outcomeRefs: ["chapter://1#end"] })).toEqual(observed);
  });

  it("rejects events without a real value exchange", async () => {
    const { root, contract, before } = await fixture();
    await expect(createRelationshipEvent({ root, projectSlug: "demo", relationshipId: "hero->ally", sourceCharacterId: "hero", targetCharacterId: "ally", contractId: contract.contractId, beforeSnapshotId: before.snapshotId, sharedEventRef: "chapter://1#scene-3", sourceCharacterChoice: "warn", targetCharacterChoice: "accept", sourceInterpretation: "suspect", targetInterpretation: "hope", visibleActions: ["talk"], valueExchange: "", immediateCost: "none", delayedCost: "none", evidenceRefs: ["chapter://1#scene-3"] })).rejects.toThrow("RELATIONSHIP_VALUE_EXCHANGE_REQUIRED");
  });

  it("records relationship dimension changes and rejects unchanged relationship state", async () => {
    const { root, contract, before, after } = await fixture();
    const planned = await createRelationshipEvent({ root, projectSlug: "demo", relationshipId: "hero->ally", sourceCharacterId: "hero", targetCharacterId: "ally", contractId: contract.contractId, beforeSnapshotId: before.snapshotId, sharedEventRef: "chapter://1#scene-4", sourceCharacterChoice: "warn", targetCharacterChoice: "accept", sourceInterpretation: "suspect", targetInterpretation: "hope", visibleActions: ["hands over route"], valueExchange: "information for protection", immediateCost: "window", delayedCost: "route exposed", evidenceRefs: ["chapter://1#scene-4"] });
    const observed = await observeRelationshipEvent({ root, eventId: planned.eventId, afterSnapshotId: after.snapshotId, outcomeRefs: ["chapter://1#end"] });
    expect(observed.relationshipChangedDimensions).toEqual(expect.arrayContaining(["trust", "privateStance"]));
    const unchanged = await createRelationshipEvent({ root, projectSlug: "demo", relationshipId: "hero->ally", sourceCharacterId: "hero", targetCharacterId: "ally", contractId: contract.contractId, beforeSnapshotId: after.snapshotId, sharedEventRef: "chapter://1#scene-5", sourceCharacterChoice: "wait", targetCharacterChoice: "wait", sourceInterpretation: "suspect", targetInterpretation: "hope", visibleActions: ["waits"], valueExchange: "silence", immediateCost: "none", delayedCost: "none", evidenceRefs: ["chapter://1#scene-5"] });
    await expect(observeRelationshipEvent({ root, eventId: unchanged.eventId, afterSnapshotId: after.snapshotId, outcomeRefs: ["chapter://1#end"] })).rejects.toThrow("RELATIONSHIP_STATE_CHANGE_REQUIRED");
  });

  it("fails closed when a re-signed observed event loses its transition evidence", async () => {
    const { root, contract, before, after } = await fixture();
    const planned = await createRelationshipEvent({ root, projectSlug: "demo", relationshipId: "hero->ally", sourceCharacterId: "hero", targetCharacterId: "ally", contractId: contract.contractId, beforeSnapshotId: before.snapshotId, sharedEventRef: "chapter://1#tamper", sourceCharacterChoice: "warn", targetCharacterChoice: "accept", sourceInterpretation: "suspect", targetInterpretation: "hope", visibleActions: ["hands over route"], valueExchange: "information for protection", immediateCost: "window", delayedCost: "route exposed", evidenceRefs: ["chapter://1#tamper"] });
    const observed = await observeRelationshipEvent({ root, eventId: planned.eventId, afterSnapshotId: after.snapshotId, outcomeRefs: ["chapter://1#end"] });
    const target = path.join(root, "sessions", "relationship-events", `${observed.eventId}.json`);
    const { fingerprint: _old, ...base } = JSON.parse(await fs.readFile(target, "utf8")) as Record<string, unknown>;
    const resigned = { ...base, relationshipChangedDimensions: [] };
    resigned.fingerprint = crypto.createHash("sha256").update(JSON.stringify(resigned)).digest("hex");
    await fs.writeFile(target, JSON.stringify(resigned), "utf8");
    await expect(readRelationshipEvent(root, observed.eventId)).rejects.toThrow("RELATIONSHIP_EVENT_INTEGRITY_FAILED");
  });
});
