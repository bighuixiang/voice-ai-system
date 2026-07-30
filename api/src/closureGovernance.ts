import crypto from "node:crypto";

export interface ObligationAdmission { schemaVersion: "obligation-admission.v1"; candidateId: string; status: "canon" | "candidate"; reason: string; fingerprint: string; }
export interface ReaderExpectation { schemaVersion: "reader-expectation.v1"; readerExpectation: "weak" | "moderate" | "strong"; fairnessRisk: boolean; signals: Record<string, number | string | boolean>; fingerprint: string; }
export interface HypothesisGraph { schemaVersion: "hypothesis-graph.v1"; graphId: string; question: string; authorTruth: string; hypotheses: Array<{ id: string; status: "viable" | "rejected" | "unknown" }>; fingerprint: string; }
export interface ClueClaim { schemaVersion: "clue-claim.v1"; claimId: string; sourceRef: string; supports: string[]; opposes: string[]; visibleContent: string; authorInterpretation: string; sourceFamily: string; fingerprint: string; }
export interface ClueIndependence { schemaVersion: "clue-independence.v1"; independent: boolean; sharedFamilies: string[]; fingerprint: string; }
export interface FairnessBundle { schemaVersion: "fairness-bundle.v1"; bundleId: string; setupRefs: string[]; reminderRefs: string[]; counterEvidenceRefs: string[]; payoffRef: string; graphFingerprint: string; salienceEvidence: string[]; independenceEvidence: string[]; firstReaderJudgment: string; authorTruth: string; remainingQuestions: string[]; status: "fair" | "payoff_candidate"; fingerprint: string; }
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function admitNarrativeObligation(input: { candidateId: string; source: string; explicit: boolean; readerSignals: number; authorRequestedTracking: boolean }): ObligationAdmission {
  if (!input.candidateId.trim() || !input.source.trim()) throw new Error("ADMISSION_FIELDS_REQUIRED"); const status = input.explicit || input.authorRequestedTracking || input.readerSignals >= 2 ? "canon" as const : "candidate" as const; const base = { schemaVersion: "obligation-admission.v1" as const, candidateId: input.candidateId, status, reason: status === "canon" ? "explicit-or-significant" : "insufficient-reader-expectation" };
  return { ...base, fingerprint: hash(base) };
}
export function calibrateReaderExpectation(input: { authorImportance: string; firstPerception: string; repetitionCount: number; narrativeEmphasis: number; characterReaction: number; causalImportance: number; genreConvention: number; obscured: boolean }): ReaderExpectation {
  const score = input.repetitionCount * 0.2 + input.narrativeEmphasis * 0.25 + input.characterReaction * 0.2 + input.causalImportance * 0.25 + input.genreConvention * 0.1; const readerExpectation = score >= 0.65 ? "strong" as const : score >= 0.35 ? "moderate" as const : "weak" as const; const base = { schemaVersion: "reader-expectation.v1" as const, readerExpectation, fairnessRisk: input.authorImportance === "high" && (readerExpectation === "weak" || input.obscured), signals: { ...input } };
  return { ...base, fingerprint: hash(base) };
}
export function createHypothesisGraph(input: Omit<HypothesisGraph, "schemaVersion" | "fingerprint">): HypothesisGraph {
  if (!input.graphId.trim() || !input.question.trim() || !input.authorTruth.trim() || input.hypotheses.length < 2) throw new Error("HYPOTHESIS_GRAPH_REQUIRED"); const base = { schemaVersion: "hypothesis-graph.v1" as const, ...input, hypotheses: input.hypotheses.map((item) => ({ ...item })) };
  return { ...base, fingerprint: hash(base) };
}
export function createClueClaim(input: Omit<ClueClaim, "schemaVersion" | "fingerprint">): ClueClaim {
  if (!input.claimId.trim() || !input.sourceRef.trim() || !input.visibleContent.trim() || !input.authorInterpretation.trim() || !input.sourceFamily.trim()) throw new Error("CLUE_CLAIM_FIELDS_REQUIRED"); const base = { schemaVersion: "clue-claim.v1" as const, ...input, supports: [...input.supports], opposes: [...input.opposes] };
  return { ...base, fingerprint: hash(base) };
}
export function validateClueIndependence(input: { claims: readonly ClueClaim[] }): ClueIndependence {
  const families = input.claims.map((claim) => claim.sourceFamily); const sharedFamilies = [...new Set(families.filter((family, index) => families.indexOf(family) !== index))]; const base = { schemaVersion: "clue-independence.v1" as const, independent: sharedFamilies.length === 0, sharedFamilies };
  return { ...base, fingerprint: hash(base) };
}
export function createFairnessBundle(input: Omit<FairnessBundle, "schemaVersion" | "status" | "fingerprint">): FairnessBundle {
  if (!input.bundleId.trim() || !input.setupRefs.length || !input.payoffRef.trim() || !input.graphFingerprint.trim() || !input.salienceEvidence.length || !input.independenceEvidence.length || !input.firstReaderJudgment.trim() || !input.authorTruth.trim()) throw new Error("FAIRNESS_BUNDLE_FIELDS_REQUIRED"); const status = input.firstReaderJudgment.toLowerCase().includes("fair") && input.remainingQuestions.length === 0 ? "fair" as const : "payoff_candidate" as const; const base = { schemaVersion: "fairness-bundle.v1" as const, ...input, setupRefs: [...input.setupRefs], reminderRefs: [...input.reminderRefs], counterEvidenceRefs: [...input.counterEvidenceRefs], salienceEvidence: [...input.salienceEvidence], independenceEvidence: [...input.independenceEvidence], remainingQuestions: [...input.remainingQuestions], status };
  return { ...base, fingerprint: hash(base) };
}
