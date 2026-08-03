import crypto from "node:crypto";

export interface SetupEvidence { schemaVersion: "obligation-setup-evidence.v1"; obligationId: string; anchor: string; visibleText: string; narrativeFunction: string; salience: { placement: number; sensorySpecificity: number; characterReaction: number; repetitionCount: number; obscuredByStrongerEvent: boolean }; fairnessRisk: boolean; fingerprint: string; }
export interface ObligationKnowledgeBoundary { schemaVersion: "obligation-knowledge-boundary.v1"; obligationId: string; authorTruth: string; readerVisible: string; povKnowledge: Record<string, string>; prohibitedDisclosure: string[]; fingerprint: string; }
export interface PayoffContract { schemaVersion: "payoff-contract.v1"; obligationId: string; requiredAnswer: string; requiredSubclaims?: string[]; allowedOpenParts: string[]; involvedCharacters: string[]; readerChange: string; prerequisites: string[]; latestWindow: string; fingerprint: string; }
export interface PayoffEvidenceResult { schemaVersion: "payoff-evidence-result.v1"; obligationId: string; status: "payoff_candidate" | "partially_paid" | "paid"; setupRefs: string[]; reminderRefs: string[]; payoffRef: string; semanticReason: string; confidence: number; observableChanges: string[]; answeredSubclaims: string[]; remainingSubclaims: string[]; fingerprint: string; }
export interface SetupFairnessGate { schemaVersion: "setup-fairness-gate.v1"; obligationId: string; status: "fair" | "fairness-risk"; fairnessRisk: boolean; remediationRequired: boolean; reason?: "LOW_SALIENCE" | "OBSCURED_BY_STRONGER_EVENT"; fingerprint: string; }
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const trace = (value: string) => /^[a-z][a-z0-9+.-]*:\/\/[^\s]+$/i.test(value);
export function evaluateSetupFairness(input: { obligationId: string; salience: SetupEvidence["salience"]; remediationEvidence?: string }): SetupFairnessGate {
  if (!input.obligationId.trim()) throw new Error("SETUP_FAIRNESS_FIELDS_REQUIRED");
  const reason = input.salience.obscuredByStrongerEvent ? "OBSCURED_BY_STRONGER_EVENT" as const : input.salience.placement < 0.35 || input.salience.sensorySpecificity < 0.35 || input.salience.characterReaction < 0.35 ? "LOW_SALIENCE" as const : undefined;
  const fairnessRisk = Boolean(reason);
  const remediationRequired = fairnessRisk && !input.remediationEvidence?.trim();
  const base = { schemaVersion: "setup-fairness-gate.v1" as const, obligationId: input.obligationId, status: remediationRequired ? "fairness-risk" as const : "fair" as const, fairnessRisk, remediationRequired, ...(reason ? { reason } : {}) };
  return { ...base, fingerprint: hash(base) };
}
export function createSetupEvidence(input: { obligationId: string; manuscriptVersion: string; start: number; end: number; visibleText: string; narrativeFunction: string; salience: SetupEvidence["salience"] }): SetupEvidence {
  if (!input.obligationId.trim() || !input.manuscriptVersion.trim() || input.start < 0 || input.end <= input.start || !input.visibleText.trim() || !input.narrativeFunction.trim()) throw new Error("SETUP_EVIDENCE_FIELDS_REQUIRED");
  const fairnessRisk = input.salience.placement < 0.35 || input.salience.sensorySpecificity < 0.35 || input.salience.obscuredByStrongerEvent;
  const base = { schemaVersion: "obligation-setup-evidence.v1" as const, obligationId: input.obligationId, anchor: `manuscript://${input.manuscriptVersion}#${input.start}-${input.end}`, visibleText: input.visibleText, narrativeFunction: input.narrativeFunction, salience: { ...input.salience }, fairnessRisk };
  return { ...base, fingerprint: hash(base) };
}
export function createObligationKnowledgeBoundary(input: Omit<ObligationKnowledgeBoundary, "schemaVersion" | "fingerprint">): ObligationKnowledgeBoundary {
  if (!input.obligationId.trim() || !input.authorTruth.trim() || !input.readerVisible.trim() || !Object.keys(input.povKnowledge).length) throw new Error("KNOWLEDGE_BOUNDARY_FIELDS_REQUIRED");
  const base = { schemaVersion: "obligation-knowledge-boundary.v1" as const, ...input, povKnowledge: { ...input.povKnowledge }, prohibitedDisclosure: [...input.prohibitedDisclosure] };
  return { ...base, fingerprint: hash(base) };
}
export function createPayoffContract(input: Omit<PayoffContract, "schemaVersion" | "fingerprint">): PayoffContract {
  if (!input.obligationId.trim() || !input.requiredAnswer.trim() || !input.involvedCharacters.length || !input.readerChange.trim() || !input.prerequisites.length || !input.latestWindow.trim()) throw new Error("PAYOFF_CONTRACT_FIELDS_REQUIRED");
  const base = { schemaVersion: "payoff-contract.v1" as const, ...input, ...(input.requiredSubclaims ? { requiredSubclaims: [...input.requiredSubclaims] } : {}), allowedOpenParts: [...input.allowedOpenParts], involvedCharacters: [...input.involvedCharacters], prerequisites: [...input.prerequisites] };
  return { ...base, fingerprint: hash(base) };
}
export function evaluatePayoffEvidence(input: { contract: PayoffContract; setupRefs: readonly string[]; reminderRefs: readonly string[]; payoffRef: string; semanticReason: string; confidence: number; observableChanges: readonly string[]; answeredSubclaims?: readonly string[] }): PayoffEvidenceResult {
  if (!input.setupRefs.length || !input.payoffRef.trim() || !input.semanticReason.trim() || !input.observableChanges.length || input.setupRefs.some((ref) => !trace(ref)) || !trace(input.payoffRef)) throw new Error("PAYOFF_EVIDENCE_CHAIN_REQUIRED");
  if (input.confidence < 0 || input.confidence > 1) throw new Error("PAYOFF_CONFIDENCE_INVALID");
  const requiredSubclaims = [...(input.contract.requiredSubclaims || [])];
  const answeredSubclaims = [...new Set(input.answeredSubclaims || [])].filter((claim) => requiredSubclaims.includes(claim));
  const remainingSubclaims = requiredSubclaims.filter((claim) => !answeredSubclaims.includes(claim));
  const status = requiredSubclaims.length === 0 ? "payoff_candidate" as const : remainingSubclaims.length === 0 ? "paid" as const : answeredSubclaims.length > 0 ? "partially_paid" as const : "payoff_candidate" as const;
  const base = { schemaVersion: "payoff-evidence-result.v1" as const, obligationId: input.contract.obligationId, status, setupRefs: [...input.setupRefs], reminderRefs: [...input.reminderRefs], payoffRef: input.payoffRef, semanticReason: input.semanticReason, confidence: input.confidence, observableChanges: [...input.observableChanges], answeredSubclaims, remainingSubclaims };
  return { ...base, fingerprint: hash(base) };
}
