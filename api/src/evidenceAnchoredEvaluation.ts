import crypto from "node:crypto";

export interface EvidenceAnchor { start: number; end: number; quoteHash: string; }
export interface EvidenceAnchoredEvaluation {
  schemaVersion: "evidence-anchored-evaluation.v1";
  evaluationId: string;
  status: "supported" | "unsupported" | "stale";
  anchors: EvidenceAnchor[];
  contractFingerprint: string;
  chapterIntentFingerprint: string;
  reason: string;
  fingerprint: string;
}

const hash = (value: unknown): string => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const textHash = (value: string): string => crypto.createHash("sha256").update(value, "utf8").digest("hex");

export function assertEvidenceAnchoredEvaluationIntegrity(evaluation: EvidenceAnchoredEvaluation, expectedId?: string): EvidenceAnchoredEvaluation {
  const { fingerprint: _fingerprint, ...base } = evaluation;
  if (evaluation.schemaVersion !== "evidence-anchored-evaluation.v1" || (expectedId !== undefined && evaluation.evaluationId !== expectedId) || !evaluation.evaluationId.trim() || !["supported", "unsupported", "stale"].includes(evaluation.status) || !Array.isArray(evaluation.anchors) || evaluation.anchors.some((anchor) => !Number.isInteger(anchor.start) || !Number.isInteger(anchor.end) || anchor.start < 0 || anchor.end <= anchor.start || !/^[a-f0-9]{64}$/i.test(anchor.quoteHash)) || !evaluation.contractFingerprint.trim() || !evaluation.chapterIntentFingerprint.trim() || !evaluation.reason.trim() || !/^[a-f0-9]{64}$/i.test(evaluation.fingerprint) || hash(base) !== evaluation.fingerprint) throw new Error("EVALUATION_EVIDENCE_INTEGRITY_FAILED");
  return evaluation;
}

export function createEvidenceAnchoredEvaluation(input: { evaluationId: string; content: string; anchors: Array<{ start: number; end: number }>; contractFingerprint: string; chapterIntentFingerprint: string; reason: string }): EvidenceAnchoredEvaluation {
  if (!input.evaluationId.trim() || !input.contractFingerprint.trim() || !input.chapterIntentFingerprint.trim() || !input.reason.trim()) throw new Error("EVALUATION_EVIDENCE_FIELDS_REQUIRED");
  if (!input.anchors.length || input.anchors.some((anchor) => !Number.isInteger(anchor.start) || !Number.isInteger(anchor.end) || anchor.start < 0 || anchor.end <= anchor.start || anchor.end > input.content.length)) throw new Error("EVALUATION_ANCHOR_INVALID");
  const anchors = input.anchors.map((anchor) => ({ ...anchor, quoteHash: textHash(input.content.slice(anchor.start, anchor.end)) }));
  const base = { schemaVersion: "evidence-anchored-evaluation.v1" as const, evaluationId: input.evaluationId.trim(), status: "supported" as const, anchors, contractFingerprint: input.contractFingerprint.trim(), chapterIntentFingerprint: input.chapterIntentFingerprint.trim(), reason: input.reason.trim() };
  return { ...base, fingerprint: hash(base) };
}

export function assertEvidenceAnchoredEvaluationCurrent(evaluation: EvidenceAnchoredEvaluation, input: { content: string; contractFingerprint: string; chapterIntentFingerprint: string }): void {
  assertEvidenceAnchoredEvaluationIntegrity(evaluation);
  if (evaluation.status !== "supported") throw new Error("EVALUATION_EVIDENCE_NOT_SUPPORTED");
  if (evaluation.contractFingerprint !== input.contractFingerprint || evaluation.chapterIntentFingerprint !== input.chapterIntentFingerprint) throw new Error("EVALUATION_EVIDENCE_STALE");
  if (evaluation.anchors.some((anchor) => anchor.end > input.content.length || textHash(input.content.slice(anchor.start, anchor.end)) !== anchor.quoteHash)) throw new Error("EVALUATION_EVIDENCE_STALE");
  const { fingerprint: _fingerprint, ...base } = evaluation;
  if (!/^[a-f0-9]{64}$/i.test(evaluation.fingerprint) || hash(base) !== evaluation.fingerprint) throw new Error("EVALUATION_EVIDENCE_INTEGRITY_FAILED");
}
