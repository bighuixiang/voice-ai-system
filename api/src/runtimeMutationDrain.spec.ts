import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readRuntimeMutationDrain, recordRuntimeMutationDrain } from "./runtimeMutationDrain.js";

describe("runtime mutation drain", () => {
  it("records drained when no mutation lease remains", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "runtime-mutation-drain-"));
    const receipt = await recordRuntimeMutationDrain({ root, boundaryId: "boundary-1", projectSlug: "demo", runId: "run-1" });
    expect(receipt).toMatchObject({ status: "drained", activeMutationLeases: [] });
    expect(await readRuntimeMutationDrain(root, receipt.drainId)).toEqual(receipt);
  });

  it("fails closed and records blocking leases", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "runtime-mutation-drain-blocked-"));
    await fs.mkdir(path.join(root, "sessions/mutations"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions/mutations", "contract-adoption.lock"), "active", "utf8");
    const receipt = await recordRuntimeMutationDrain({ root, boundaryId: "boundary-1", projectSlug: "demo", runId: "run-1" });
    expect(receipt).toMatchObject({ status: "blocked", activeMutationLeases: ["contract-adoption.lock"] });
  });
});
