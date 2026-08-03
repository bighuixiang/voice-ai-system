import { describe, expect, it } from "vitest";
import { consumeSafeExploration } from "./safeExplorationBudget.js";

describe("safe exploration budget", () => {
  it("stops probing after rejection or exhausted budget and never contaminates canon", () => {
    expect(consumeSafeExploration({ budget: 2, used: 1, sceneCritical: false, canonWrite: false, authorRejected: true })).toMatchObject({ status: "stopped", remaining: 1, contaminatesCanon: false });
    expect(consumeSafeExploration({ budget: 2, used: 2, sceneCritical: false, canonWrite: false, authorRejected: false }).status).toBe("stopped");
  });
});
