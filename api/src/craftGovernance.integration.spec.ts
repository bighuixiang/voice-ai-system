import { describe, expect, it } from "vitest";
import { createSourceLineage, revokeSourceLineage } from "./sourceRevocation.js";
import { validateCraftHoldout } from "./craftHoldoutValidation.js";
import { createCraftAttribution } from "./craftAttribution.js";
import { createCraftProvenanceBundle } from "./craftProvenance.js";
import { propagateCraftSourceRevocation } from "./craftRevocationPropagation.js";

describe("craft governance cross-module chain", () => {
  it("carries source evidence through validation, adoption, publication and precise revocation", () => {
    const lineage = createSourceLineage({ sourceId: "source-chain", projectSlug: "demo", accessClass: "restricted", derivedPatternIds: ["pattern-chain"], sourceRefs: ["source://chain"] });
    const holdout = validateCraftHoldout({ experimentId: "experiment-chain", extractionSceneIds: ["scene-extract"], cases: [
      { caseId: "holdout-1", sceneId: "scene-investigate", chapterFunction: "investigation", inputFingerprint: "input-1", labelSealed: true, generatorVisible: false, baselineScore: 0.4, treatmentScore: 0.7, hardGuardsPassed: true },
      { caseId: "holdout-2", sceneId: "scene-aftermath", chapterFunction: "aftermath", inputFingerprint: "input-2", labelSealed: true, generatorVisible: false, baselineScore: 0.4, treatmentScore: 0.65, hardGuardsPassed: true }
    ], sourceRefs: ["experiment://chain"] });
    expect(holdout.status).toBe("cross-scene-validated");
    const attribution = createCraftAttribution({ candidateId: "candidate-chain", patternId: "pattern-chain", projectSlug: "demo", authorId: "author-chain", judgment: "mechanism", scope: "scene:investigation", rationale: "mechanism fits this scene", evidenceRefs: ["author://chain"] });
    const provenance = createCraftProvenanceBundle({ candidateId: attribution.candidateId, patternId: attribution.patternId, sceneId: "scene-investigate", sources: [{ snapshotId: "snapshot-chain", sourceFamily: "licensed-family", accessClass: lineage.accessClass, fingerprint: lineage.fingerprint, independentGroup: "group-chain" }], transformations: [{ kind: "abstract-mechanism", description: "mechanism-only transfer", evidenceRefs: ["transform://chain"] }], evaluationRefs: [holdout.experimentId], adoptionChangeSetRefs: [attribution.attributionId], proseVersionRefs: ["prose://chain"], qualityReportRefs: ["quality://chain"], releaseSnapshotRefs: ["release://chain"], sourceRefs: ["audit://chain"] });
    expect(provenance.artifacts.releaseSnapshotRefs).toContain("release://chain");
    const revocation = revokeSourceLineage(lineage, { mode: "delete-source-and-derivatives", actor: "rights-admin", reason: "license withdrawn", evidenceRefs: ["rights://chain"] });
    const propagated = propagateCraftSourceRevocation({ sourceId: lineage.sourceId, eventId: "revocation-chain", reason: revocation.reason, evidenceRefs: revocation.evidenceRefs, sourceFingerprint: lineage.fingerprint, artifacts: [
      { artifactId: provenance.patternId, kind: "pattern", sourceIds: [lineage.sourceId], status: "active" },
      { artifactId: "release://chain", kind: "published-prose", sourceIds: [lineage.sourceId], status: "published" }
    ], sourceRefs: [provenance.fingerprint] });
    expect(propagated.invalidatedArtifactIds).toContain("pattern-chain");
    expect(propagated.retainedHistoricalArtifactIds).toContain("release://chain");
  });
});
