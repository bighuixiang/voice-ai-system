export type EffortValuePhase = "exploration" | "writing" | "audit";
export interface EffortValueMeasurement {
  schemaVersion: "author-effort-value.v1";
  phase: EffortValuePhase;
  genre: string;
  activeCreativeMs: number;
  passiveWaitMs: number;
  blockingIssues: number;
  repeatedConfirmations: number;
  reviewLoad: number;
  correctionPropagationMs: number;
  interruptions: number;
  misunderstandings: number;
  reworkCount: number;
  hiddenAutonomyDecisions: number;
  qualityRegressions: number;
  notificationCount: number;
  assetsProduced: number;
  assetsAdopted: number;
  assetValueStatus: "evidence-backed" | "insufficient-evidence";
  antiMetricGuard: "passed" | "blocked";
  valueScore?: number;
}

interface Asset { assetId: string; produced: boolean; adopted: boolean; valueEvidence: string[]; }
const nonNegative = (value: number) => Number.isFinite(value) && value >= 0;

export function assertEffortValueMeasurementIntegrity(measurement: EffortValueMeasurement): void {
  if (measurement.schemaVersion !== "author-effort-value.v1" || !["exploration", "writing", "audit"].includes(measurement.phase) || !measurement.genre.trim()) throw new Error("EFFORT_VALUE_MEASUREMENT_INVALID");
  const numeric = [measurement.activeCreativeMs, measurement.passiveWaitMs, measurement.blockingIssues, measurement.repeatedConfirmations, measurement.reviewLoad, measurement.correctionPropagationMs, measurement.interruptions, measurement.misunderstandings, measurement.reworkCount, measurement.hiddenAutonomyDecisions, measurement.qualityRegressions, measurement.notificationCount, measurement.assetsProduced, measurement.assetsAdopted];
  if (!numeric.every(nonNegative) || !Number.isInteger(measurement.assetsProduced) || !Number.isInteger(measurement.assetsAdopted) || measurement.assetsAdopted > measurement.assetsProduced) throw new Error("EFFORT_VALUE_MEASUREMENT_INVALID");
  if (measurement.hiddenAutonomyDecisions > 0 || measurement.qualityRegressions > 0) {
    if (measurement.antiMetricGuard !== "blocked" || measurement.valueScore !== undefined) throw new Error("EFFORT_VALUE_ANTIMETRIC_BYPASS");
  }
}

export function measureAuthorEffortValue(input: { phase: EffortValuePhase; genre: string; activeCreativeMs: number; passiveWaitMs: number; blockingIssues: number; repeatedConfirmations: number; reviewItems: number; correctionPropagationMs: number; interruptions: number; misunderstandings?: number; reworkCount?: number; hiddenAutonomyDecisions?: number; qualityRegressions?: number; notificationCount?: number; assets: Asset[] }): EffortValueMeasurement {
  const antiMetrics = [input.misunderstandings ?? 0, input.reworkCount ?? 0, input.hiddenAutonomyDecisions ?? 0, input.qualityRegressions ?? 0, input.notificationCount ?? 0];
  if (!input.genre.trim() || ![input.activeCreativeMs, input.passiveWaitMs, input.blockingIssues, input.repeatedConfirmations, input.reviewItems, input.correctionPropagationMs, input.interruptions, ...antiMetrics].every(nonNegative)) throw new Error("EFFORT_VALUE_INPUT_INVALID");
  if (input.assets.some((asset) => !asset.assetId.trim() || !Array.isArray(asset.valueEvidence))) throw new Error("EFFORT_VALUE_ASSET_INVALID");
  const assetsProduced = input.assets.filter((asset) => asset.produced).length;
  const assetsAdopted = input.assets.filter((asset) => asset.produced && asset.adopted).length;
  const evidenced = input.assets.filter((asset) => asset.produced && asset.adopted && asset.valueEvidence.length).length;
  const antiMetricGuard = (input.hiddenAutonomyDecisions ?? 0) > 0 || (input.qualityRegressions ?? 0) > 0 ? "blocked" as const : "passed" as const;
  const base: EffortValueMeasurement = { schemaVersion: "author-effort-value.v1", phase: input.phase, genre: input.genre, activeCreativeMs: input.activeCreativeMs, passiveWaitMs: input.passiveWaitMs, blockingIssues: input.blockingIssues, repeatedConfirmations: input.repeatedConfirmations, reviewLoad: input.reviewItems, correctionPropagationMs: input.correctionPropagationMs, interruptions: input.interruptions, misunderstandings: input.misunderstandings ?? 0, reworkCount: input.reworkCount ?? 0, hiddenAutonomyDecisions: input.hiddenAutonomyDecisions ?? 0, qualityRegressions: input.qualityRegressions ?? 0, notificationCount: input.notificationCount ?? 0, assetsProduced, assetsAdopted, assetValueStatus: evidenced === assetsAdopted && assetsAdopted > 0 ? "evidence-backed" : "insufficient-evidence", antiMetricGuard };
  return base.assetValueStatus === "evidence-backed" && antiMetricGuard === "passed" ? { ...base, valueScore: assetsAdopted / Math.max(1, assetsProduced) } : base;
}
