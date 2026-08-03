import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { assertCharacterContractIntegrity, confirmCharacterContract, createCharacterDramaticContract, listCharacterContracts, readCharacterDramaticContract, reviseCharacterDramaticContract } from "./characterContract.js";

const input = (root: string, characterId = "hero") => ({ root, projectSlug: "demo", characterId, displayName: "Hero", externalWant: "escape", internalNeed: "trust others", falseBelief: "trust is weakness", woundOrFear: "abandonment", valuesAndBoundaries: ["protect the innocent"], contradiction: "wants freedom but seeks control", stake: "lose the team", unacceptableChoice: "betray a child", potentialChange: "accept interdependence", unknown: ["final loyalty decision"], sources: [{ field: "externalWant", provenance: "author-confirmed" as const, sourceVersion: "author-1", evidenceRefs: ["author://brief#1"] }, { field: "falseBelief", provenance: "inference" as const, sourceVersion: "model-1", evidenceRefs: ["inference://session#2"] }] });

describe("character dramatic contract", () => {
  it("preserves explicit unknowns and provenance without writing canon", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "character-contract-"));
    const contract = await createCharacterDramaticContract(input(root));
    expect(contract.lifecycle).toBe("candidate");
    expect(contract.unknown).toContain("final loyalty decision");
    expect(contract.sources.find((item) => item.field === "falseBelief")?.provenance).toBe("inference");
    expect(await readCharacterDramaticContract(root, contract.contractId)).toEqual(contract);
  });

  it("requires an explicit author confirmation and lists by project", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "character-contract-"));
    const contract = await createCharacterDramaticContract(input(root));
    await expect(confirmCharacterContract({ root, contractId: contract.contractId, actor: "author", reason: "confirmed core motivation" })).resolves.toMatchObject({ lifecycle: "confirmed", confirmation: { actor: "author" } });
    expect(await listCharacterContracts(root, "other")).toEqual([]);
    expect((await listCharacterContracts(root, "demo"))[0].contractId).toBe(contract.contractId);
  });

  it("rejects missing provenance and empty unknown declarations", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "character-contract-"));
    await expect(createCharacterDramaticContract({ ...input(root), sources: [] })).rejects.toThrow("CHARACTER_CONTRACT_SOURCES_REQUIRED");
  });

  it("creates an immutable versioned revision instead of overwriting the prior contract", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "character-contract-"));
    const original = await createCharacterDramaticContract(input(root));
    const revised = await reviseCharacterDramaticContract({ root, contractId: original.contractId, actor: "author", reason: "clarified the fear", changes: { woundOrFear: "abandonment after betrayal", unknown: ["final loyalty decision"] } });
    expect(original.contractVersion).toBe(1);
    expect(revised.contractVersion).toBe(2);
    expect(revised.supersedesContractId).toBe(original.contractId);
    expect(revised.lifecycle).toBe("candidate");
    expect(await readCharacterDramaticContract(root, original.contractId)).toEqual(original);
  });

  it("fails closed when a persisted character contract is tampered", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "character-contract-tamper-"));
    const contract = await createCharacterDramaticContract(input(root));
    const target = path.join(root, "sessions", "character-contracts", `${contract.contractId}.json`);
    const tampered = { ...contract, externalWant: "changed", fingerprint: "f".repeat(64) };
    await fs.writeFile(target, JSON.stringify(tampered), "utf8");
    await expect(readCharacterDramaticContract(root, contract.contractId)).rejects.toThrow("CHARACTER_CONTRACT_INTEGRITY_FAILED");
    await expect(listCharacterContracts(root, "demo")).rejects.toThrow("CHARACTER_CONTRACT_INTEGRITY_FAILED");
    expect(() => assertCharacterContractIntegrity(tampered, contract.contractId)).toThrow("CHARACTER_CONTRACT_INTEGRITY_FAILED");
  });
});
