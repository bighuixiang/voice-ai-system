import { describe, expect, it } from "vitest";
import { classifyClueDirection, classifyObjectObligation, clusterEvidenceSources, evaluateFairnessBundle, evaluateReaderExpectation, updateHypothesisGraph } from "./fairnessEvidenceGates.js";
describe("fairness evidence gates", () => {
  it("keeps a decorative cup from becoming an obligation", () => { expect(classifyObjectObligation({ mentionCount: 1, characterReaction: false, narrativeEmphasis: false, causalRole: false, authorPromise: false })).toMatchObject({ status: "decorative", createsObligation: false }); });
  it("does not infer fairness from backend importance", () => { expect(evaluateReaderExpectation({ backendImportance: "high", visibleMentions: 1, sensorySpecificity: 0.1, readerRecall: 0.1 }).status).toBe("under_setup"); });
  it("retains competing hypotheses without revealing truth", () => { expect(updateHypothesisGraph({ hypotheses: ["protagonist", "dean", "hacker"], clueSupports: { dean: ["c1"] }, clueExcludes: { hacker: ["c1"] }, authorTruthHidden: true })).toMatchObject({ hypotheses: ["protagonist", "dean", "hacker"], truthRevealed: false }); });
  it("does not count motif-only rain as directional clue", () => { expect(classifyClueDirection({ clue: "rain", supports: [], excludes: [], affectsAction: false, motifOnly: true })).toMatchObject({ status: "motif_only", fairnessCount: 0 }); });
  it("clusters clues sharing one anonymous source", () => { expect(clusterEvidenceSources({ clues: [{ id: "witness", sourceFamily: "anonymous-call" }, { id: "news", sourceFamily: "anonymous-call" }, { id: "brief", sourceFamily: "anonymous-call" }] })).toMatchObject({ effectiveEvidenceCount: 1, reliabilityRisk: true }); });
  it("stales fairness after anchor deletion", () => { expect(evaluateFairnessBundle({ anchorFingerprint: "old", currentFingerprint: "new", obligationStatus: "resolved" })).toEqual({ status: "stale", obligationStatus: "payoff_candidate" }); });
});
