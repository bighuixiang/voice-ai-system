import { describe, expect, it } from "vitest";
import { evaluateUpstreamRepair } from "./upstreamRepairGate.js";
describe("upstream repair", () => { it("does not mask missing understanding with defaults", () => { expect(evaluateUpstreamRepair({ understandingSnapshot: "missing", defaultStoryIntentUsed: true, repairAvailable: true, legacyEditingAvailable: true })).toEqual({ status: "repair_required", fallbackUsed: false, legacyEditingAvailable: true }); }); });
