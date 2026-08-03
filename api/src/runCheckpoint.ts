import crypto from "node:crypto";

export type CheckpointStage = "planning" | "model-call" | "settlement" | "projection";
export interface RunCheckpoint {
  schemaVersion: "run-checkpoint.v1";
  checkpointId: string;
  bookRunId: string;
  workItemId: string;
  stage: CheckpointStage;
  workGraphFingerprint: string;
  assetFingerprint: string;
  invocationFingerprint: string;
  mutationPlanFingerprint: string;
  reusableArtifactRefs: string[];
  stableAt: string;
  fingerprint: string;
}
export type RecoveryAction = "rerun-readonly" | "manual-review" | "rebuild-projection" | "rollback-mutation";
export interface CheckpointRecoveryPlan { action: RecoveryAction; resultKnowledge: "known" | "unknown"; reason: string; }
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function createRunCheckpoint(input: Omit<RunCheckpoint, "schemaVersion" | "checkpointId" | "fingerprint">): RunCheckpoint {
  if (![input.bookRunId, input.workItemId, input.workGraphFingerprint, input.assetFingerprint, input.invocationFingerprint, input.mutationPlanFingerprint, input.stableAt].every((value) => value.trim())) throw new Error("CHECKPOINT_FIELDS_REQUIRED");
  if (!Array.isArray(input.reusableArtifactRefs) || input.reusableArtifactRefs.some((ref) => !ref.trim())) throw new Error("CHECKPOINT_ARTIFACT_REFS_INVALID");
  const base = { schemaVersion: "run-checkpoint.v1" as const, checkpointId: `checkpoint-${hash(input).slice(0, 20)}`, ...input, reusableArtifactRefs: [...input.reusableArtifactRefs] };
  return { ...base, fingerprint: hash(base) };
}

export function planCheckpointRecovery(input: { stage: CheckpointStage; providerCharged: boolean; canonCommitted: boolean; mutationOpen: boolean }): CheckpointRecoveryPlan {
  if (input.mutationOpen) return { action: "rollback-mutation", resultKnowledge: "known", reason: "OPEN_MUTATION_REQUIRES_ROLLBACK" };
  if (input.canonCommitted) return { action: "rebuild-projection", resultKnowledge: "known", reason: "CANON_COMMITTED_PROJECTION_MAY_BE_STALE" };
  if (input.providerCharged && input.stage === "model-call") return { action: "manual-review", resultKnowledge: "unknown", reason: "CHARGED_CALL_RESULT_UNKNOWN" };
  return { action: "rerun-readonly", resultKnowledge: "known", reason: "READ_ONLY_STAGE_REPLAYABLE" };
}
