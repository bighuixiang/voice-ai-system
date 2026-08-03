import { describe, expect, it } from "vitest";
import { diagnoseImport, gatePunctuationRepair, isolateModelPackaging, settleRoundTrip } from "./textIntegrityGates.js";
describe("text integrity gates", () => {
  it("blocks invalid bytes but treats newline differences mechanically", () => { expect(diagnoseImport({ encodingValid: false, rawHash: "r", newlineKinds: ["LF"], semanticHash: "s" }).blocked).toBe(true); });
  it("rejects global punctuation replacement", () => { expect(gatePunctuationRepair({ profileAllows: true, protectedBlock: false, semanticEquivalent: true, globalReplace: true }).blocked).toBe(true); });
  it("does not unwrap ambiguous model packaging into canon", () => { expect(isolateModelPackaging({ uniqueBodyBoundary: false, wrapperFields: ["analysis", "taskId"], rawPreserved: true }).canAdopt).toBe(false); });
  it("requires equivalent parse-render round trip and rejects old baseline", () => { expect(settleRoundTrip({ firstStructure: "a", secondStructure: "a", mechanicalRepairs: 0, ambiguousAnchors: 0, oldBaseline: true }).accepted).toBe(false); });
});
