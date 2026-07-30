import crypto from "node:crypto";

export type SeedCompilationStatus = "seed_captured" | "interpreting" | "clarification_required" | "contract_candidate_ready" | "contract_partially_adopted" | "contract_ready" | "repair_required";
export interface SeedCompilationState { schemaVersion: "seed-compilation-state.v1"; projectId: string; status: SeedCompilationStatus; storySkeletonReady: boolean; stableUnderstandingFingerprint?: string; failure?: { layer: string; message: string }; recoveryAction?: string; fingerprint: string; }
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function createSeedCompilationState(input: { projectId: string; status: SeedCompilationStatus; stableUnderstandingFingerprint?: string }): SeedCompilationState {
  if (!input.projectId.trim()) throw new Error("SEED_PROJECT_REQUIRED");
  const storySkeletonReady = input.status === "contract_ready" || input.status === "contract_partially_adopted";
  const base = { schemaVersion: "seed-compilation-state.v1" as const, projectId: input.projectId, status: input.status, storySkeletonReady, ...(input.stableUnderstandingFingerprint ? { stableUnderstandingFingerprint: input.stableUnderstandingFingerprint } : {}) };
  return { ...base, fingerprint: hash(base) };
}
export function recordSeedCompilationFailure(state: SeedCompilationState, failure: { layer: string; message: string; recoveryAction: string }): SeedCompilationState {
  if (!failure.layer.trim() || !failure.message.trim() || !failure.recoveryAction.trim()) throw new Error("SEED_FAILURE_DETAILS_REQUIRED");
  const base = { ...state, status: "repair_required" as const, storySkeletonReady: false, failure: { layer: failure.layer, message: failure.message }, recoveryAction: failure.recoveryAction };
  return { ...base, fingerprint: hash(base) };
}
