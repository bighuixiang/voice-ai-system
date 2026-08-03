import { describe, expect, it } from "vitest";
import { assertCraftRevocationPropagationIntegrity, propagateCraftSourceRevocation } from "./craftRevocationPropagation.js";

const base = {
  sourceId: "source-1", eventId: "revoke-1", reason: "rights withdrawn", evidenceRefs: ["rights://1"], sourceFingerprint: "source-fp-1",
  artifacts: [
    { artifactId: "pattern-1", kind: "pattern" as const, sourceIds: ["source-1"], status: "active" as const },
    { artifactId: "cache-1", kind: "context-cache" as const, sourceIds: ["source-1"], status: "active" as const },
    { artifactId: "candidate-1", kind: "candidate" as const, sourceIds: ["source-1"], status: "active" as const },
    { artifactId: "published-1", kind: "published-prose" as const, sourceIds: ["source-1"], status: "published" as const },
    { artifactId: "other-1", kind: "pattern" as const, sourceIds: ["source-2"], status: "active" as const }
  ], sourceRefs: ["audit://revoke-1"]
};

describe("craft source revocation propagation", () => {
  it("invalidates only exact consumers and preserves published historical fingerprints", () => {
    const result = propagateCraftSourceRevocation(base);
    expect(result.invalidatedArtifactIds).toEqual(["pattern-1", "cache-1", "candidate-1"]);
    expect(result.artifacts.find((item) => item.artifactId === "published-1")?.status).toBe("historical-source-retained");
    expect(result.artifacts.find((item) => item.artifactId === "published-1")?.historicalSourceFingerprint).toBe("source-fp-1");
    expect(result.artifacts.find((item) => item.artifactId === "other-1")?.status).toBe("active");
  });

  it("requires an auditable revocation reason and does not silently clear lineage", () => {
    expect(() => propagateCraftSourceRevocation({ ...base, reason: "", evidenceRefs: [] })).toThrow("CRAFT_REVOCATION_EVIDENCE_REQUIRED");
    const result = propagateCraftSourceRevocation(base);
    expect(result.sourceFingerprint).toBe("source-fp-1");
    expect(result.eventId).toBe("revoke-1");
  });
  it("rejects blank provenance, duplicate artifacts, and exposes derivative disposition", () => {
    expect(() => propagateCraftSourceRevocation({ ...base, evidenceRefs: [" "] })).toThrow("CRAFT_REVOCATION_EVIDENCE_REQUIRED");
    expect(() => propagateCraftSourceRevocation({ ...base, artifacts: [base.artifacts[0], base.artifacts[0]] })).toThrow("CRAFT_REVOCATION_ARTIFACT_DUPLICATE");
    expect(propagateCraftSourceRevocation(base).derivativeDisposition).toBe("invalidated");
    expect(() => propagateCraftSourceRevocation({ ...base, artifacts: [{ ...base.artifacts[0], kind: "unknown" as never }] })).toThrow("CRAFT_REVOCATION_ARTIFACT_INVALID"); const result = propagateCraftSourceRevocation(base); expect(() => assertCraftRevocationPropagationIntegrity({ ...result, reason: "tampered" })).toThrow("CRAFT_REVOCATION_INTEGRITY_FAILED");
  });
});
