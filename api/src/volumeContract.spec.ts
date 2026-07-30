import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createVolumeContract, listVolumeContracts, readVolumeContract } from "./volumeContract.js";

const input = (root: string, volumeId = "volume-01") => ({ root, projectSlug: "demo", volumeId, title: "Ash Gate", openingState: "city under siege", stageGoals: ["secure the gate", "find the traitor"], primaryConflict: "trust versus survival", rolePositions: ["hero:scout", "ally:warden"], irreversibleDuties: ["protect the refugees"], climaxChoice: "close the gate", stagePayoffs: ["traitor exposed"], endPressure: "enemy fleet arrives", capacityBudget: { chapters: 20, words: 60000 }, sourceRefs: ["outline://volume-01"] });

describe("volume contract", () => {
  it("stores volume-level commitments and capacity budget", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "volume-contract-"));
    const volume = await createVolumeContract(input(root));
    expect(volume.schemaVersion).toBe("volume-contract.v1");
    expect(volume.capacityBudget.chapters).toBe(20);
    expect(volume.status).toBe("candidate");
    expect(await readVolumeContract(root, volume.volumeId)).toEqual(volume);
  });

  it("is idempotent and project-isolated", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "volume-contract-"));
    const volume = await createVolumeContract(input(root));
    expect(await createVolumeContract(input(root))).toEqual(volume);
    expect(await listVolumeContracts(root, "other")).toEqual([]);
    expect(await listVolumeContracts(root, "demo")).toHaveLength(1);
  });

  it("rejects incomplete commitments or invalid capacity", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "volume-contract-"));
    await expect(createVolumeContract({ ...input(root), stageGoals: [] })).rejects.toThrow("VOLUME_CONTRACT_COMMITMENTS_REQUIRED");
    await expect(createVolumeContract({ ...input(root), capacityBudget: { chapters: 0, words: 10 } })).rejects.toThrow("VOLUME_CONTRACT_CAPACITY_INVALID");
  });
});
