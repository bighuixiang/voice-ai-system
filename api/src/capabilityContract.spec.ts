import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { assertCapabilityContractIntegrity, assertProgressionEventIntegrity, createCapabilityContract, createProgressionEvent, listCapabilityContracts, readCapabilityContract } from "./capabilityContract.js";

const input = (root: string) => ({ root, projectSlug: "demo", holderId: "hero", name: "anchor-fold", sourceRefs: ["world://rule-1"], canDo: "fold a bounded path", cannotDo: ["cross without anchor"], prerequisites: ["charged anchor"], inputs: ["anchor", "focus"], consumption: ["one charge", "fatigue"], scope: ["linked region"], duration: "one breath", cooldown: "one day", precision: "exact anchor coordinates", counters: ["disrupt anchor"], progressionPath: ["learn geometry", "stabilize focus"], disclosure: "institution-belief", evidenceRefs: ["chapter://1#power"] });

describe("capability contract", () => {
  it("keeps executable boundaries and evidence", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "capability-"));
    const capability = await createCapabilityContract(input(root));
    expect(capability.status).toBe("candidate");
    expect(capability.permanent).toBe(false);
    expect(capability.counters).toContain("disrupt anchor");
    expect(await readCapabilityContract(root, capability.capabilityId)).toEqual(capability);
  });

  it("is idempotent and records progression with trigger, cost, and evidence", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "capability-"));
    const capability = await createCapabilityContract(input(root));
    expect(await createCapabilityContract(input(root))).toEqual(capability);
    const event = await createProgressionEvent({ root, capabilityId: capability.capabilityId, trigger: "training under pressure", acquisition: "learned geometry", acquisitionKind: "permanent", retained: "one extra charge", abandoned: "safe retreat", limitation: "still needs anchor", newChoice: "attempt narrow fold", proseRefs: ["chapter://2#scene"], sourceRefs: ["chapter://2#scene"] });
    expect(event.schemaVersion).toBe("progression-event.v1");
    expect(event.limitation).toContain("anchor");
    expect(event.acquisitionKind).toBe("permanent");
  });

  it("rejects missing constraints and unknown capability", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "capability-"));
    await expect(createCapabilityContract({ ...input(root), consumption: [] })).rejects.toThrow("CAPABILITY_CONSUMPTION_REQUIRED");
    await expect(createProgressionEvent({ root, capabilityId: "missing", trigger: "x", acquisition: "y", acquisitionKind: "borrowed-tool", retained: "z", abandoned: "none", limitation: "anchor", newChoice: "try", proseRefs: ["chapter://2"], sourceRefs: ["chapter://2"] })).rejects.toThrow("CAPABILITY_NOT_FOUND");
    expect(await listCapabilityContracts(root, "demo")).toEqual([]);
  });

  it("fails closed when a persisted capability contract is tampered", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "capability-tamper-"));
    const capability = await createCapabilityContract(input(root));
    const target = path.join(root, "sessions", "capability-contracts", `${capability.capabilityId}.json`);
    const tampered = { ...capability, status: "confirmed" as const, fingerprint: "f".repeat(64) };
    await fs.writeFile(target, JSON.stringify(tampered), "utf8");
    await expect(readCapabilityContract(root, capability.capabilityId)).rejects.toThrow("CAPABILITY_CONTRACT_INTEGRITY_FAILED");
    await expect(listCapabilityContracts(root, "demo")).rejects.toThrow("CAPABILITY_CONTRACT_INTEGRITY_FAILED");
    expect(() => assertCapabilityContractIntegrity(tampered, capability.capabilityId)).toThrow("CAPABILITY_CONTRACT_INTEGRITY_FAILED");
  });

  it("fails closed when an existing progression event is tampered", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "progression-tamper-"));
    const capability = await createCapabilityContract(input(root));
    const event = await createProgressionEvent({ root, capabilityId: capability.capabilityId, trigger: "pressure", acquisition: "geometry", acquisitionKind: "permanent", retained: "charge", abandoned: "retreat", limitation: "anchor", newChoice: "fold", proseRefs: ["chapter://2"], sourceRefs: ["chapter://2"] });
    const target = path.join(root, "sessions", "progression-events", `${event.progressionId}.json`);
    const tampered = { ...event, limitation: "no limits", fingerprint: "f".repeat(64) };
    await fs.writeFile(target, JSON.stringify(tampered), "utf8");
    await expect(createProgressionEvent({ root, capabilityId: capability.capabilityId, trigger: "pressure", acquisition: "geometry", acquisitionKind: "permanent", retained: "charge", abandoned: "retreat", limitation: "anchor", newChoice: "fold", proseRefs: ["chapter://2"], sourceRefs: ["chapter://2"] })).rejects.toThrow("PROGRESSION_EVENT_INTEGRITY_FAILED");
    expect(() => assertProgressionEventIntegrity(tampered, event.progressionId)).toThrow("PROGRESSION_EVENT_INTEGRITY_FAILED");
  });
});
