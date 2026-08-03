import { describe, expect, it } from "vitest";
import { assertCraftProvenanceIntegrity, createCraftProvenanceBundle, projectCraftProvenance } from "./craftProvenance.js";

const input = {
  candidateId: "candidate-1", patternId: "pattern-1", sceneId: "scene-1", sourceRefs: ["audit://bundle-1"],
  sources: [
    { snapshotId: "snap-1", sourceFamily: "publisher-a", accessClass: "public" as const, fingerprint: "fp-a", independentGroup: "group-a" },
    { snapshotId: "snap-2", sourceFamily: "publisher-b", accessClass: "private" as const, fingerprint: "fp-b", independentGroup: "group-b" }
  ],
  transformations: [{ kind: "abstract-mechanism" as const, description: "converted surface into trigger and effect", evidenceRefs: ["transform://1"] }],
  evaluationRefs: ["experiment://1"], adoptionChangeSetRefs: ["changeset://1"], proseVersionRefs: ["prose://v1"], qualityReportRefs: ["quality://1"], releaseSnapshotRefs: ["release://1"]
};

describe("craft provenance", () => {
  it("requires and preserves the full candidate-to-release lineage", () => {
    const bundle = createCraftProvenanceBundle(input);
    expect(bundle.sourceFamilies).toEqual(["publisher-a", "publisher-b"]);
    expect(bundle.artifacts.releaseSnapshotRefs).toEqual(["release://1"]);
    expect(bundle.independentEvidenceGroups).toEqual(["group-a", "group-b"]);
  });

  it("projects reader output without private source details", () => {
    const bundle = createCraftProvenanceBundle(input);
    const reader = projectCraftProvenance(bundle, "reader");
    expect(reader.sources).toEqual([]);
    expect(reader.sourceFamilies).toEqual([]);
    expect(reader.artifacts).toEqual({ evaluationRefs: [], adoptionChangeSetRefs: [], proseVersionRefs: ["prose://v1"], qualityReportRefs: ["quality://1"], releaseSnapshotRefs: ["release://1"] });
  });

  it("keeps an auditable source fingerprint and transformation evidence", () => {
    const bundle = createCraftProvenanceBundle(input);
    const audit = projectCraftProvenance(bundle, "author-audit");
    expect(audit.sources).toHaveLength(2);
    expect(audit.transformations[0]?.evidenceRefs).toContain("transform://1");
    expect(audit.fingerprint).toBe(bundle.fingerprint);
  });
  it("rejects malformed lineage and fails closed on tampering", () => { expect(() => createCraftProvenanceBundle({ ...input, sources: [{ ...input.sources[0], accessClass: "invalid" as never }] })).toThrow("CRAFT_PROVENANCE_SOURCE_METADATA_REQUIRED"); expect(() => createCraftProvenanceBundle({ ...input, transformations: [{ ...input.transformations[0], evidenceRefs: [" "] }] })).toThrow("CRAFT_PROVENANCE_TRANSFORMATION_EVIDENCE_REQUIRED"); const bundle = createCraftProvenanceBundle(input); expect(() => assertCraftProvenanceIntegrity({ ...bundle, sceneId: "tampered" })).toThrow("CRAFT_PROVENANCE_INTEGRITY_FAILED"); });
});
