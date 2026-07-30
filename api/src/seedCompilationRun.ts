import crypto from "node:crypto";

export type SeedRunStatus = "captured" | "interpreting" | "reviewable" | "failed" | "completed";
export interface SeedCompilationRun { schemaVersion: "seed-compilation-run.v1"; runId: string; projectSlug: string; idempotencyKey: string; inputFingerprint: string; compilerVersion: string; sourceMessageIds: string[]; status: SeedRunStatus; containerCreated: true; interpretationComplete: boolean; modelCallIssued: boolean; canonWritten: false; recoveryCheckpoint?: string; recoveryAction?: string; failure?: { layer: string; message: string }; fingerprint: string; }
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const allowed: Record<SeedRunStatus, SeedRunStatus[]> = { captured: ["interpreting", "failed"], interpreting: ["reviewable", "failed"], reviewable: ["completed", "failed"], failed: ["interpreting"], completed: [] };
export function createSeedCompilationRun(input: { projectSlug: string; idempotencyKey: string; inputFingerprint: string; compilerVersion: string; sourceMessageIds: readonly string[] }): SeedCompilationRun {
  if (!input.projectSlug.trim() || !input.idempotencyKey.trim() || !input.inputFingerprint.trim() || !input.compilerVersion.trim() || !input.sourceMessageIds.length) throw new Error("SEED_RUN_FIELDS_REQUIRED");
  const identity = { projectSlug: input.projectSlug, idempotencyKey: input.idempotencyKey, inputFingerprint: input.inputFingerprint, compilerVersion: input.compilerVersion };
  const base = { schemaVersion: "seed-compilation-run.v1" as const, runId: `seed-run-${hash(identity).slice(0, 20)}`, ...identity, sourceMessageIds: [...input.sourceMessageIds], status: "captured" as const, containerCreated: true as const, interpretationComplete: false, modelCallIssued: false, canonWritten: false as const };
  return { ...base, fingerprint: hash(base) };
}
export function transitionSeedCompilationRun(run: SeedCompilationRun, next: SeedRunStatus, input: { checkpoint?: string; failure?: { layer: string; message: string }; recoveryAction?: string } = {}): SeedCompilationRun {
  if (!allowed[run.status].includes(next)) throw new Error("SEED_RUN_TRANSITION_INVALID");
  if (next === "failed" && (!(input.checkpoint || run.recoveryCheckpoint)?.trim() || !input.failure?.layer.trim() || !input.failure.message.trim() || !input.recoveryAction?.trim())) throw new Error("SEED_RUN_FAILURE_RECOVERY_REQUIRED");
  if (next === "interpreting" && run.status === "failed" && !run.recoveryAction) throw new Error("SEED_RUN_RECOVERY_ACTION_MISSING");
  const base = { ...run, status: next, interpretationComplete: next === "completed" || next === "reviewable", ...(input.checkpoint ? { recoveryCheckpoint: input.checkpoint } : {}), ...(input.failure ? { failure: input.failure } : {}), ...(input.recoveryAction ? { recoveryAction: input.recoveryAction } : {}) };
  return { ...base, fingerprint: hash(base) };
}
export function replaySeedCompilationRun(run: SeedCompilationRun, input: { inputFingerprint: string; compilerVersion: string }): { replayable: boolean; reason?: "input-fingerprint-stale" | "compiler-version-stale"; runId: string } {
  if (run.inputFingerprint !== input.inputFingerprint) return { replayable: false, reason: "input-fingerprint-stale", runId: run.runId };
  if (run.compilerVersion !== input.compilerVersion) return { replayable: false, reason: "compiler-version-stale", runId: run.runId };
  return { replayable: true, runId: run.runId };
}
