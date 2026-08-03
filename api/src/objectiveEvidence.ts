import crypto from "node:crypto";

export type ObjectiveEvidenceType = "hard-fact" | "structure-coverage" | "prose-anchor" | "blind-preference" | "human-judgment" | "longitudinal-trend" | "proxy-metric";
export interface ObjectiveEvidenceItem { type: ObjectiveEvidenceType; ref: string; description: string; metric?: "word-frequency" | "length" | "keyword" | "single-evaluator-score" | "other"; score?: number; }
export interface ObjectiveEvidenceResult { schemaVersion: "objective-evidence-result.v1"; objectiveId: string; status: "supported" | "insufficient" | "blocked"; evidenceTypes: ObjectiveEvidenceType[]; reason?: "METRIC_GAMING_RISK" | "EVIDENCE_REQUIRED"; fingerprint: string; }
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function evaluateObjectiveEvidence(input: { objectiveId: string; objectiveKind: "aesthetic" | "factual" | "structural"; evidence: ObjectiveEvidenceItem[] }): ObjectiveEvidenceResult {
  if (!input.objectiveId.trim()) throw new Error("OBJECTIVE_ID_REQUIRED");
  const evidenceTypes = input.evidence.map((item) => item.type);
  const proxyMetrics = input.evidence.filter((item) => item.type === "proxy-metric");
  const gamingProxy = proxyMetrics.some((item) => item.metric === "word-frequency" || item.metric === "length" || item.metric === "keyword" || item.metric === "single-evaluator-score");
  const independentEvidence = input.evidence.some((item) => item.type === "prose-anchor" || item.type === "blind-preference" || item.type === "human-judgment" || item.type === "longitudinal-trend");
  let status: ObjectiveEvidenceResult["status"] = input.evidence.length ? "supported" : "insufficient";
  let reason: ObjectiveEvidenceResult["reason"];
  if (!input.evidence.length) reason = "EVIDENCE_REQUIRED";
  if (input.objectiveKind === "aesthetic" && (gamingProxy || (proxyMetrics.length && !independentEvidence))) { status = "blocked"; reason = "METRIC_GAMING_RISK"; }
  const base = { schemaVersion: "objective-evidence-result.v1" as const, objectiveId: input.objectiveId, status, evidenceTypes: [...evidenceTypes], ...(reason ? { reason } : {}) };
  return { ...base, fingerprint: hash(base) };
}
