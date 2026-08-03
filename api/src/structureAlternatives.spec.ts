import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createStructureAlternativeSet, listStructureAlternativeSets, readStructureAlternativeSet } from "./structureAlternatives.js";

const input = (root: string) => ({ root, projectSlug: "demo", setId: "structure-set-1", contractFingerprint: "a".repeat(64), alternatives: [{ alternativeId: "a", label: "Pressure-first", sequence: ["pressure", "choice", "payoff"], pacing: "fast", agency: "hero chooses under pressure", suspenseFairness: "clues before reveal", payoffDifficulty: "medium", lengthImpact: "shorter", changeScope: "chapter order" }, { alternativeId: "b", label: "Mystery-first", sequence: ["clue", "misread", "reveal"], pacing: "slow", agency: "ally drives investigation", suspenseFairness: "delayed clue", payoffDifficulty: "high", lengthImpact: "longer", changeScope: "new interludes" }], sourceRefs: ["contract://story-1"] });

describe("structure alternative set", () => {
  it("stores genuinely distinct alternatives and comparison dimensions", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "structure-alt-"));
    const set = await createStructureAlternativeSet(input(root));
    expect(set.alternatives).toHaveLength(2);
    expect(set.alternatives[0].sequence).not.toEqual(set.alternatives[1].sequence);
    expect(await readStructureAlternativeSet(root, set.setId)).toEqual(set);
  });

  it("is idempotent, lists by project, and rejects duplicate or shallow alternatives", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "structure-alt-"));
    const set = await createStructureAlternativeSet(input(root));
    expect(await createStructureAlternativeSet(input(root))).toEqual(set);
    expect(await listStructureAlternativeSets(root, "other")).toEqual([]);
    await expect(createStructureAlternativeSet({ ...input(root), setId: "bad", alternatives: [input(root).alternatives[0], { ...input(root).alternatives[0], alternativeId: "c", label: "same" }] })).rejects.toThrow("STRUCTURE_ALTERNATIVES_NOT_DISTINCT");
  });

  it("requires a stable story contract fingerprint and evidence", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "structure-alt-"));
    await expect(createStructureAlternativeSet({ ...input(root), contractFingerprint: "bad" })).rejects.toThrow("STRUCTURE_CONTRACT_FINGERPRINT_REQUIRED");
    await expect(createStructureAlternativeSet({ ...input(root), sourceRefs: [] })).rejects.toThrow("STRUCTURE_ALTERNATIVE_SOURCE_REQUIRED");
  });

  it("rejects sequence-only wording changes without meaningful structural divergence", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "structure-alt-"));
    const first = input(root).alternatives[0];
    await expect(createStructureAlternativeSet({ ...input(root), setId: "wording-only", alternatives: [first, { ...first, alternativeId: "b", label: "Different wording", sequence: ["pressure", "choice", "payoff-v2"] }] })).rejects.toThrow("STRUCTURE_ALTERNATIVES_NOT_STRUCTURALLY_DISTINCT");
  });

  it("fails closed when an alternative set is tampered", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "structure-alt-"));
    const set = await createStructureAlternativeSet(input(root));
    const target = path.join(root, "sessions", "structure-alternatives", `${set.setId}.json`);
    const persisted = JSON.parse(await fs.readFile(target, "utf8"));
    await fs.writeFile(target, JSON.stringify({ ...persisted, contractFingerprint: "b".repeat(64) }), "utf8");
    await expect(readStructureAlternativeSet(root, set.setId)).rejects.toThrow("STRUCTURE_ALTERNATIVE_SET_INTEGRITY_FAILED");
    await expect(listStructureAlternativeSets(root, "demo")).rejects.toThrow("STRUCTURE_ALTERNATIVE_SET_INTEGRITY_FAILED");
  });
});
