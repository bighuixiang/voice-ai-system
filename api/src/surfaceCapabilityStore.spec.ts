import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createSurfaceCapabilityRegistry, registerSurfaceCapability } from "./surfaceCapability.js";
import { readSurfaceCapabilityRegistry, writeSurfaceCapabilityRegistry } from "./surfaceCapabilityStore.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe("surface capability registry persistence", () => {
  it("round-trips the server-owned registry across process boundaries", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "surface-registry-"));
    roots.push(root);
    const registry = registerSurfaceCapability(createSurfaceCapabilityRegistry("demo"), {
      surfaceId: "creative-session",
      label: "Creative session",
      reads: ["journey"],
      commands: ["append"],
      writeAuthority: "creative-session",
      stages: ["capture"],
      alternativeSurfaceId: "legacy",
      retirementCondition: "equivalence",
      lifecycle: "active"
    }).registry;
    await writeSurfaceCapabilityRegistry(root, registry);
    await expect(readSurfaceCapabilityRegistry(root, "demo")).resolves.toEqual(registry);
    await expect(readSurfaceCapabilityRegistry(root, "other")).rejects.toThrow("SURFACE_REGISTRY_INVALID");
  });
});
