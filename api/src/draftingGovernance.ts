import crypto from "node:crypto";

export interface StageObjectiveWeights { schemaVersion: "stage-objective-weights.v1"; stage: "contract" | "outline" | "drafting" | "revision"; strategyVersion: string; weights: Record<string, number>; hardConstraints: string[]; evidenceRefs: string[]; fingerprint: string; }
export interface AntiGoalGuardResult { schemaVersion: "anti-goal-guard.v1"; status: "passed" | "repair-required"; antiGoals: string[]; hits: Array<{ antiGoal: string; evidence: string }>; repairScope: string[]; fingerprint: string; }
export interface Q003Profile { schemaVersion: "q003-profile.v1"; status: "unconfirmed" | "confirmed"; speedPreference?: number; qualityPreference?: number; metrics: string[]; safetyInvariants: string[]; fingerprint: string; }
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function createStageObjectiveWeights(input: Omit<StageObjectiveWeights, "schemaVersion" | "fingerprint">): StageObjectiveWeights {
  if (!input.stage.trim() || !input.strategyVersion.trim() || !input.evidenceRefs.length) throw new Error("STAGE_WEIGHTS_FIELDS_REQUIRED");
  if (Object.values(input.weights).some((weight) => !Number.isFinite(weight) || weight < 0)) throw new Error("STAGE_WEIGHTS_INVALID");
  if (input.hardConstraints.some((id) => input.weights[id] !== undefined && input.weights[id] <= 0)) throw new Error("HARD_CONSTRAINT_WEIGHT_INVALID");
  const base = { schemaVersion: "stage-objective-weights.v1" as const, ...input, weights: { ...input.weights }, hardConstraints: [...input.hardConstraints], evidenceRefs: [...input.evidenceRefs] };
  return { ...base, fingerprint: hash(base) };
}

export function evaluateAntiGoalGuard(input: { text: string; antiGoals: Array<{ antiGoal: string; evidence: string; patterns: string[] }>; repairScope: string[] }): AntiGoalGuardResult {
  if (!input.text.trim()) throw new Error("ANTI_GOAL_TEXT_REQUIRED");
  const hits = input.antiGoals.flatMap((antiGoal) => antiGoal.patterns.filter((pattern) => pattern.trim() && input.text.toLocaleLowerCase().includes(pattern.toLocaleLowerCase())).map(() => ({ antiGoal: antiGoal.antiGoal, evidence: antiGoal.evidence })));
  const base = { schemaVersion: "anti-goal-guard.v1" as const, status: hits.length ? "repair-required" as const : "passed" as const, antiGoals: input.antiGoals.map((item) => item.antiGoal), hits, repairScope: [...input.repairScope] };
  return { ...base, fingerprint: hash(base) };
}

export function createQ003Profile(input: { status: "unconfirmed" | "confirmed"; speedPreference?: number; qualityPreference?: number; evidenceRefs: string[] }): Q003Profile {
  if (input.status === "confirmed" && !input.evidenceRefs.length) throw new Error("Q003_EVIDENCE_REQUIRED");
  if ([input.speedPreference, input.qualityPreference].some((value) => value !== undefined && (!Number.isFinite(value) || value < 0 || value > 1))) throw new Error("Q003_PREFERENCE_INVALID");
  const base = { schemaVersion: "q003-profile.v1" as const, status: input.status, ...(input.speedPreference === undefined ? {} : { speedPreference: input.speedPreference }), ...(input.qualityPreference === undefined ? {} : { qualityPreference: input.qualityPreference }), metrics: ["delivery-speed", "rework-volume", "author-acceptance", "hard-constraint-failures", "quality-evidence"], safetyInvariants: ["safety", "canon", "rights", "narrative-closure"] };
  return { ...base, fingerprint: hash(base) };
}
