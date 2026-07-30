import crypto from "node:crypto";

export interface DebateEvidence { ref: string; claim: string; }
export interface DebateSide { thesis: string; evidence: DebateEvidence[]; benefits: string[]; failureConditions: string[]; unknowns: string[]; }
export interface DebateDecision {
  schemaVersion: "debate-decision.v1";
  debateId: string;
  taskId: string;
  proposition: string;
  frozenInputFingerprint: string;
  blue: DebateSide;
  red: DebateSide;
  blueFinding: string;
  redFinding: string;
  disagreements: Array<{ topic: string; blue: string; red: string }>;
  decisionLevel: "L0" | "L1" | "L2";
  affectedAssets: string[];
  evidenceRefs: string[];
  fallbackCost: string;
  status: "reviewable" | "needs-author" | "blocked" | "accepted";
  authorRequired: boolean;
  supersedesDecisionId?: string;
  migrationProposal?: string;
  fingerprint: string;
}

const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const cleanSide = (side: DebateSide): DebateSide => ({ thesis: side.thesis.trim(), evidence: side.evidence.map((item) => ({ ref: item.ref.trim(), claim: item.claim.trim() })), benefits: [...side.benefits], failureConditions: [...side.failureConditions], unknowns: [...side.unknowns] });

export function createDebateDecision(input: Omit<DebateDecision, "schemaVersion" | "blueFinding" | "redFinding" | "status" | "authorRequired" | "fingerprint">): DebateDecision {
  if (!input.debateId.trim() || !input.taskId.trim() || !input.proposition.trim() || !input.frozenInputFingerprint.trim() || !input.fallbackCost.trim() || !input.affectedAssets.length) throw new Error("DEBATE_FIELDS_REQUIRED");
  if (!input.evidenceRefs.length) throw new Error("DEBATE_EVIDENCE_REQUIRED");
  const blue = cleanSide(input.blue), red = cleanSide(input.red);
  if (!blue.thesis || !blue.evidence.length) throw new Error("DEBATE_BLUE_ARGUMENT_REQUIRED");
  const redEvidenceBacked = Boolean(red.thesis && red.evidence.length);
  const redFinding = redEvidenceBacked ? red.thesis : "未发现同等强度的反例；继续监控已列风险";
  const blueFinding = blue.thesis;
  const authorRequired = input.decisionLevel === "L2" || input.disagreements.length > 0;
  const status = !redEvidenceBacked && !red.unknowns.length && !red.failureConditions.length ? "blocked" as const : authorRequired ? "needs-author" as const : "reviewable" as const;
  const base = { schemaVersion: "debate-decision.v1" as const, ...input, blue, red, blueFinding, redFinding, disagreements: input.disagreements.map((item) => ({ ...item })), affectedAssets: [...input.affectedAssets], evidenceRefs: [...input.evidenceRefs], status, authorRequired };
  return { ...base, fingerprint: hash(base) };
}

export function acceptDebateDecision(card: DebateDecision, approval?: { authorDecision: "accept" | "reject"; supersedesDecisionId?: string; migrationProposal?: string }): DebateDecision {
  if (card.status === "blocked") throw new Error("DEBATE_BLOCKED");
  if (card.authorRequired && (!approval || approval.authorDecision !== "accept")) throw new Error("DEBATE_AUTHOR_APPROVAL_REQUIRED");
  if (approval?.supersedesDecisionId && !approval.migrationProposal?.trim()) throw new Error("DEBATE_MIGRATION_PROPOSAL_REQUIRED");
  const base = { ...card, status: "accepted" as const, ...(approval?.supersedesDecisionId ? { supersedesDecisionId: approval.supersedesDecisionId, migrationProposal: approval.migrationProposal!.trim() } : {}) };
  const { fingerprint: _fingerprint, ...canonical } = base;
  return { ...base, fingerprint: hash(canonical) };
}
