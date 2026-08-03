import { describe, expect, it } from "vitest";
import { advanceEvidenceStatus, applyQualityStrategy, classifyClaimAuthority, enforceCharacterVisibility, keepSameNameSeparate, preserveContradiction, resolveTemporalKnowledge, supersedeClaim, transferCharacterKnowledge, preserveCharacterBelief, separateReaderAndPov, filterEligibility, buildRetconImpactReport, propagateEvidenceDeletion, preserveBodyTruthOverSummary, validateLossyCompression, rankEligibleClaims, constrainKnowledgeQuery, groupEvidenceFamily, reportEvidenceGap, gateGenerationOnConflict, keepNewFactsCandidate, assessMemoryHealth, deterministicRebuild, preserveEligibilityOnEmbeddingFallback, auditContinuity, activateK5 } from "./knowledgeTruthGates.js";
describe("knowledge truth gates", () => {
  it("changes quality parameters without changing schema", () => { expect(applyQualityStrategy({ strategy: "quality", candidateCount: 4, reviewDepth: 2, chapterThreshold: 0.8, schemaFingerprint: "s1" })).toMatchObject({ candidateCount: 6, reviewDepth: 3, schemaFingerprint: "s1" }); });
  it("does not release without immutable runtime evidence", () => { expect(advanceEvidenceStatus({ hasType: true, hasTest: true, hasScreenshot: true, immutableEvidence: false, requiredRuntimeEvidence: false, deletedTest: false })).toBe("implemented"); });
  it("keeps unadopted plan and candidate out of canon", () => { expect(classifyClaimAuthority({ source: "candidate", adopted: false })).toBe("candidate"); });
  it("blocks author truth leakage into character context", () => { expect(enforceCharacterVisibility({ authorTruth: true, characterHasEvidence: false, leaksTruth: true }).rejected).toBe(true); });
  it("uses temporal validity over stale summaries", () => { expect(resolveTemporalKnowledge({ currentChapter: 8, injuryChapter: 2, recoveryChapter: 6 })).toBe("recovered"); });
  it("does not merge same-name people without evidence", () => { expect(keepSameNameSeparate({ sameName: true, aliasAssertion: false, identityEvidence: false })).toMatchObject({ merged: false, needsEvidence: true }); });
  it("keeps contradictions explicit", () => { expect(preserveContradiction({ claims: ["key-holder-a", "key-holder-b"], resolved: false }).status).toBe("open"); });
  it("excludes superseded claims while retaining history", () => { expect(supersedeClaim({ current: "bloodline", superseded: [], replacement: "contract" })).toMatchObject({ current: "contract", excluded: ["bloodline"] }); });
  it("moves character knowledge only after anchored evidence", () => { expect(transferCharacterKnowledge({ evidenceChapter: 5, targetChapter: 4, evidencePresent: true }).known).toBe(false); });
  it("keeps character belief separate from canon fact", () => { expect(preserveCharacterBelief({ belief: "betrayal", canonFact: "forged", isTrue: false }).factEligible).toBe(false); });
  it("allows dramatic irony but rejects unexplained POV avoidance", () => { expect(separateReaderAndPov({ readerKnows: true, povKnows: false, avoidsWithoutCause: true }).rejected).toBe(true); });
  it("filters obsolete and invisible secrets before ranking", () => { expect(filterEligibility({ claims: [{ id: "secret", obsolete: true, visible: true }, { id: "current", obsolete: false, visible: true }] })).toEqual(["current"]); });
  it("reports retcon impact without changing authority before adoption", () => { expect(buildRetconImpactReport({ impacted: { prose: ["p1"], aliases: ["a1"] }, adopted: false })).toMatchObject({ authorityChanged: false, recompute: [] }); });
  it("blocks generation while deletion propagation is incomplete", () => { expect(propagateEvidenceDeletion({ descendants: ["summary", "index"], propagationComplete: false }).blocked).toBe(true); });
  it("keeps body evidence authoritative over summary", () => { expect(preserveBodyTruthOverSummary({ bodyClaim: "missing", summaryClaim: "dead", summaryCorrected: true }).canon).toBe("missing"); });
  it("preserves the full lossy compression audit contract", () => {
    expect(validateLossyCompression({ inputRefs: ["claim://1", "body://1"], omitted: ["detail"], requiredFields: ["epistemic"], retainedFields: ["epistemic"], target: "chapter-context", strategyVersion: "rules-v2", inputTokens: 100, outputTokens: 60, knownLosses: ["minor-description"], reconstructionPointer: "body#1" })).toMatchObject({ valid: true, tokenSavings: 40, target: "chapter-context", strategyVersion: "rules-v2", knownLosses: ["minor-description"] });
  });

  it("fails closed when compression provenance or loss accounting is missing", () => {
    expect(validateLossyCompression({ inputRefs: [], omitted: [], requiredFields: ["epistemic"], retainedFields: ["epistemic"], target: "", strategyVersion: "", inputTokens: 10, outputTokens: 10, knownLosses: [], reconstructionPointer: "" }).valid).toBe(false);
  });
  it("filters eligibility before score ordering", () => { expect(rankEligibleClaims({ claims: [{ id: "obsolete", score: .99, obsolete: true, visible: true }, { id: "current", score: .72, obsolete: false, visible: true }] })).toEqual(["current"]); });
  it("requires time and POV query boundaries", () => { expect(constrainKnowledgeQuery({ claims: [], readerProgress: 2 }).status).toBe("insufficient-boundary"); });
  it("groups derived copies into one evidence family", () => { expect(groupEvidenceFamily({ sources: [{ family: "p1", independent: false }, { family: "p1", independent: false }] }).diversity).toBe(0); });
  it("reports plan-only and extraction failures honestly", () => { expect(reportEvidenceGap({ planOnly: true, extractionFailed: true, contradictionKnown: false }).states).toEqual(["plan-only", "extraction_failed"]); });
  it("blocks generation on unresolved high-risk memory conflict", () => { expect(gateGenerationOnConflict({ highRiskConflict: true, proposedPlan: "clarify witness", redEvidence: ["r"], blueEvidence: ["b"] }).allowed).toBe(false); });
  it("keeps new generated facts as candidates until settlement", () => { expect(keepNewFactsCandidate({ adopted: false, worldRuleConfirmed: true, settled: true, claimId: "c1" }).status).toBe("candidate"); });
  it("reports memory coverage and risks independently", () => { expect(assessMemoryHealth({ chapterCoverage: .7, identityConflicts: 2, staleProjections: 1 }).healthy).toBe(false); });
  it("rebuilds deterministically without new truth events", () => { expect(deterministicRebuild({ eventFingerprint: "e", schema: "s", rebuiltFingerprint: "e", emitsNewTruthEvent: false }).identical).toBe(true); });
  it("keeps eligibility exclusions across embedding fallback", () => { expect(preserveEligibilityOnEmbeddingFallback({ primaryFailed: true, primaryIds: ["secret"], fallbackIds: ["current"], excluded: ["secret"] }).ids).toEqual(["current"]); });
  it("rejects continuity pass with high-risk audit gaps", () => { expect(auditContinuity({ unknowns: 0, earlyKnowledge: 1, mergedIdentities: 0, scannedRatio: 1 }).passed).toBe(false); });
  it("activates K5 only after all evidence fixtures pass", () => { expect(activateK5({ shadowVerified: true, secretBoundaryVerified: true, retconVerified: true, deletionVerified: true, fallbackVerified: false }).active).toBe(false); });
});
