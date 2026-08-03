export type ProgressStage = "planned" | "generated" | "reviewed" | "settled" | "audited";
export interface RunProgressProjection {
  schemaVersion: "run-progress-projection.v1";
  workGraphVersion: number;
  denominators: { workItems: number; weight: number };
  byWorkItem: Record<ProgressStage, number>;
  byChapter: Record<string, { stage: ProgressStage; weight: number }>;
  byObligation: { open: number; closed: number };
  percentComplete: number;
  criticalPath: string[];
  etaRange: { lowMs: number; highMs: number };
  costRange: { lowCents: number; highCents: number };
  blockers: string[];
  activeLeases: number;
  openMutations: number;
}

export function projectRunProgress(input: { graphVersion: number; items: Array<{ workItemId: string; chapterId: string; stage: ProgressStage; weight: number }>; openObligations: number; activeLeases: number; openMutations: number; estimatedCostCents: number; costVarianceCents: number }): RunProgressProjection {
  if (!Number.isInteger(input.graphVersion) || input.graphVersion < 1 || input.items.some((item) => !Number.isFinite(item.weight) || item.weight <= 0)) throw new Error("PROGRESS_INPUT_INVALID");
  const byWorkItem: Record<ProgressStage, number> = { planned: 0, generated: 0, reviewed: 0, settled: 0, audited: 0 };
  const byChapter: Record<string, { stage: ProgressStage; weight: number }> = {};
  let totalWeight = 0; let completedWeight = 0;
  for (const item of input.items) { byWorkItem[item.stage] += 1; byChapter[item.chapterId] = { stage: item.stage, weight: item.weight }; totalWeight += item.weight; if (item.stage === "settled" || item.stage === "audited") completedWeight += item.weight; }
  const variance = Math.max(0, input.costVarianceCents);
  return { schemaVersion: "run-progress-projection.v1", workGraphVersion: input.graphVersion, denominators: { workItems: input.items.length, weight: totalWeight }, byWorkItem, byChapter, byObligation: { open: input.openObligations, closed: 0 }, percentComplete: totalWeight ? completedWeight / totalWeight : 0, criticalPath: input.items.filter((item) => item.stage !== "audited").map((item) => item.workItemId), etaRange: { lowMs: input.items.length * 1000, highMs: input.items.length * 3000 }, costRange: { lowCents: Math.max(0, input.estimatedCostCents - variance), highCents: input.estimatedCostCents + variance }, blockers: [...(input.openObligations ? ["open-obligations"] : []), ...(input.openMutations ? ["open-mutations"] : [])], activeLeases: input.activeLeases, openMutations: input.openMutations };
}
