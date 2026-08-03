export type StagnationThreshold = "repeated-work-fingerprint" | "rewrite-loop" | "repeated-question" | "quality-oscillation" | "no-new-assets" | "completion-obligation-mismatch";
export interface StagnationIncident {
  schemaVersion: "stagnation-incident.v1";
  status: "running" | "paused";
  thresholds: StagnationThreshold[];
  threshold: StagnationThreshold | null;
  rootCauseHypotheses: string[];
  breakOptions: Array<"change-input" | "ask-author" | "narrow-scope" | "replan-subgraph">;
  evidence: { workFingerprints: string[]; rewriteCount: number; newAssetCount: number; completionSignals: number; openObligations: number };
}

export function detectStagnation(input: { workFingerprints: string[]; rewriteCount: number; questionFingerprints: string[]; qualityScores: number[]; newAssetCount: number; completionSignals: number; openObligations: number }): StagnationIncident {
  if (![input.rewriteCount, input.newAssetCount, input.completionSignals, input.openObligations].every((value) => Number.isInteger(value) && value >= 0)) throw new Error("STAGNATION_INPUT_INVALID");
  const thresholds: StagnationThreshold[] = [];
  const repeatedWork = input.workFingerprints.length >= 3 && new Set(input.workFingerprints.slice(-3)).size === 1;
  if (repeatedWork) thresholds.push("repeated-work-fingerprint");
  if (input.rewriteCount >= 3) thresholds.push("rewrite-loop");
  if (input.questionFingerprints.length >= 3 && new Set(input.questionFingerprints.slice(-3)).size === 1) thresholds.push("repeated-question");
  const quality = input.qualityScores.slice(-4);
  if (quality.length === 4 && quality[0] === quality[2] && quality[1] === quality[3] && quality[0] !== quality[1]) thresholds.push("quality-oscillation");
  if (input.newAssetCount === 0 && (input.workFingerprints.length >= 2 || input.rewriteCount > 0)) thresholds.push("no-new-assets");
  if (input.completionSignals > 0 && input.openObligations > 0) thresholds.push("completion-obligation-mismatch");
  const rootCauseHypotheses = thresholds.map((threshold) => ({
    "repeated-work-fingerprint": "same input or strategy is being retried",
    "rewrite-loop": "local repair is not changing the causal defect",
    "repeated-question": "understanding gap is not being resolved",
    "quality-oscillation": "evaluation or objective signal is unstable",
    "no-new-assets": "calls continue without producing reusable evidence",
    "completion-obligation-mismatch": "completion signal conflicts with open obligations"
  }[threshold]));
  return { schemaVersion: "stagnation-incident.v1", status: thresholds.length ? "paused" : "running", thresholds, threshold: thresholds[0] || null, rootCauseHypotheses, breakOptions: ["change-input", "ask-author", "narrow-scope", "replan-subgraph"], evidence: { workFingerprints: [...input.workFingerprints], rewriteCount: input.rewriteCount, newAssetCount: input.newAssetCount, completionSignals: input.completionSignals, openObligations: input.openObligations } };
}
