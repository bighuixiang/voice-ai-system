import { describe, expect, it } from "vitest";
import { evaluateContextReplay, evaluatePostCallEvidence } from "./contextEvidenceGate.js";
import type { ContextManifest } from "./contextManifest.js";

const manifest: ContextManifest = {
  schemaVersion: "context-manifest.v1", manifestId: "context-1", projectSlug: "demo", purpose: "understanding",
  sourceSessionId: "session-1", sourceFingerprint: "source-1", frozenAt: "2026-07-31T00:00:00.000Z",
  sourceMessages: [{ id: "m1", role: "author", sourceKind: "author", text: "confirmed", sourceSpan: { start: 0, end: 9 } }],
  blocks: [{ id: "m1", tier: "T0", sourceRefs: ["m1"], sourceVersion: "source-1", sourceHash: "h1", originalTokens: 3, finalTokens: 3, compression: "none", permission: "author", selected: true }]
};

describe("context evidence and replay gates", () => {
  it("passes only when the frozen manifest and deterministic invocation are unchanged", () => {
    expect(evaluateContextReplay({ manifest, expectedManifestId: "context-1", expectedSourceFingerprint: "source-1", expectedSchemaVersion: "context-manifest.v1", route: "understanding.v1", deterministic: { temperature: 0, seed: 7, topP: 1 } }).status).toBe("pass");
    expect(evaluateContextReplay({ manifest, expectedManifestId: "context-old", expectedSourceFingerprint: "source-old", expectedSchemaVersion: "context-manifest.v1", route: "understanding.v1", deterministic: { temperature: 0.2, seed: 7, topP: 1 } }).reasons).toEqual(expect.arrayContaining(["MANIFEST_STALE", "DETERMINISTIC_PARAMETERS_REQUIRED"]));
  });

  it("marks claims citing unselected or changed sources as conflicted", () => {
    expect(evaluatePostCallEvidence({ manifest, sourceRefs: ["m1"], sourceVersions: { m1: "source-1" } }).status).toBe("supported");
    expect(evaluatePostCallEvidence({ manifest, sourceRefs: ["m2"] }).status).toBe("conflicted");
    expect(evaluatePostCallEvidence({ manifest, sourceRefs: ["m1"], sourceVersions: { m1: "old" } }).unsupportedSourceRefs).toEqual(["m1"]);
  });

  it("requires declared contract, chapter intent, key facts, and evidence for adoption", () => {
    const supported = evaluatePostCallEvidence({
      manifest,
      sourceRefs: ["m1"],
      sourceVersions: { m1: "source-1" },
      requiredContractRefs: ["contract:v1"],
      requiredChapterIntentRefs: ["chapter-intent:ch1"],
      claims: [{ claimId: "c1", text: "the choice is irreversible", contractRefs: ["contract:v1"], chapterIntentRefs: ["chapter-intent:ch1"], keyFactRefs: ["m1"], evidenceRefs: ["m1"], scope: "supported" }]
    });
    expect(supported.status).toBe("supported");

    const conflicted = evaluatePostCallEvidence({
      manifest,
      sourceRefs: ["m1"],
      requiredContractRefs: ["contract:v1"],
      requiredChapterIntentRefs: ["chapter-intent:ch1"],
      claims: [{ claimId: "c1", text: "unsupported", contractRefs: [], chapterIntentRefs: [], keyFactRefs: [], evidenceRefs: ["m2"], scope: "supported" }]
    });
    expect(conflicted.status).toBe("conflicted");
    expect(conflicted.reasons).toEqual(expect.arrayContaining(["CONTRACT_NOT_DECLARED", "CHAPTER_INTENT_NOT_DECLARED", "CLAIM_EVIDENCE_UNSUPPORTED"]));
  });

  it("fails closed when a manifest block loses source evidence", () => {
    expect(() => evaluateContextReplay({ manifest: { ...manifest, blocks: [{ ...manifest.blocks[0], sourceRefs: [] }] }, expectedManifestId: "context-1", expectedSourceFingerprint: "source-1", expectedSchemaVersion: "context-manifest.v1", route: "understanding.v1", deterministic: { temperature: 0, seed: 7, topP: 1 } })).toThrow("CONTEXT_MANIFEST_INTEGRITY_FAILED");
  });
});
