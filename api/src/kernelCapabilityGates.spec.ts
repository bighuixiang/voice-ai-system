import { describe, expect, it } from "vitest";
import { checkSchemaCompatibility, createMinimalObligation, enforceDependencyProof, executeMutationPlan, isolateLegacySamples, unifyCandidateKernel } from "./kernelCapabilityGates.js";
describe("kernel capability gates", () => {
  it("keeps schema drift read-only", () => { expect(checkSchemaCompatibility({ apiVersion: "v2", uiVersion: "v1", generatedTypesMatch: false, unknownFields: ["DecisionEscalation"] })).toMatchObject({ status: "read-only", writable: false }); });
  it("rolls back partial multi-asset write", () => { expect(executeMutationPlan({ writes: [{ asset: "event", succeeded: true }, { asset: "projection", succeeded: false }], recovered: false })).toMatchObject({ status: "rolled_back", visible: false }); });
  it("stales all candidate domains after contract change", () => { expect(unifyCandidateKernel({ parentBaseline: "base", stableId: "c1", statuses: ["draft", "draft"], contractChanged: true, locks: ["author"] }).status).toBe("stale"); });
  it("does not seed planned obligation without prose anchor", () => { expect(createMinimalObligation({ obligationId: "o1", window: "ch4", status: "seeded", proseAnchors: [] })).toMatchObject({ status: "planned", seededAllowed: false }); });
  it("isolates legacy samples before first model call", () => { expect(isolateLegacySamples({ legacyExcerptCount: 2, contextManifest: "m1", budget: 10, permissions: [] })).toMatchObject({ status: "isolated", excerptInjected: false }); });
  it("rejects server write when dependency proof missing", () => { expect(enforceDependencyProof({ required: ["k2-recovery"], present: [], requestedWrite: true })).toMatchObject({ status: "rejected", writes: false }); });
});
