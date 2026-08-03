import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";

export type SeedRunStatus = "captured" | "interpreting" | "reviewable" | "failed" | "completed";
export interface SeedCompilationRun { schemaVersion: "seed-compilation-run.v1"; runId: string; projectSlug: string; idempotencyKey: string; inputFingerprint: string; compilerVersion: string; sourceMessageIds: string[]; status: SeedRunStatus; containerCreated: true; interpretationComplete: boolean; modelCallIssued: boolean; canonWritten: false; recoveryCheckpoint?: string; recoveryAction?: string; failure?: { layer: string; message: string }; fingerprint: string; }
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const runPath = (root: string, runId: string): string => resolveInside(root, `sessions/seed-compilation-runs/${runId}.json`);
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
  const { fingerprint: _oldFingerprint, ...withoutFingerprint } = run;
  const base = { ...withoutFingerprint, status: next, interpretationComplete: next === "completed" || next === "reviewable", ...(input.checkpoint ? { recoveryCheckpoint: input.checkpoint } : {}), ...(input.failure ? { failure: input.failure } : {}), ...(input.recoveryAction ? { recoveryAction: input.recoveryAction } : {}) };
  return { ...base, fingerprint: hash(base) };
}
export function replaySeedCompilationRun(run: SeedCompilationRun, input: { inputFingerprint: string; compilerVersion: string }): { replayable: boolean; reason?: "input-fingerprint-stale" | "compiler-version-stale"; runId: string } {
  if (run.inputFingerprint !== input.inputFingerprint) return { replayable: false, reason: "input-fingerprint-stale", runId: run.runId };
  if (run.compilerVersion !== input.compilerVersion) return { replayable: false, reason: "compiler-version-stale", runId: run.runId };
  return { replayable: true, runId: run.runId };
}

export function assertSeedCompilationRunIntegrity(value: unknown, expectedRunId?: string): asserts value is SeedCompilationRun {
  const run = value as Partial<SeedCompilationRun>;
  const { fingerprint, ...base } = run as SeedCompilationRun;
  if (run.schemaVersion !== "seed-compilation-run.v1" || (expectedRunId && run.runId !== expectedRunId) || !run.runId?.trim() || !run.projectSlug?.trim() || !run.idempotencyKey?.trim() || !run.inputFingerprint?.trim() || !run.compilerVersion?.trim() || !Array.isArray(run.sourceMessageIds) || run.sourceMessageIds.length === 0 || !run.sourceMessageIds.every((id) => typeof id === "string" && id.trim()) || !["captured", "interpreting", "reviewable", "failed", "completed"].includes(run.status || "") || run.containerCreated !== true || typeof run.interpretationComplete !== "boolean" || typeof run.modelCallIssued !== "boolean" || run.canonWritten !== false || !/^[a-f0-9]{64}$/i.test(fingerprint || "") || hash(base) !== fingerprint) throw new Error("SEED_RUN_INTEGRITY_FAILED");
}

export async function persistSeedCompilationRun(root: string, run: SeedCompilationRun): Promise<SeedCompilationRun> {
  assertSeedCompilationRunIntegrity(run);
  const target = runPath(root, run.runId);
  try {
    const existing = JSON.parse(await fs.readFile(target, "utf8")) as SeedCompilationRun;
    assertSeedCompilationRunIntegrity(existing, run.runId);
    if (existing.fingerprint === run.fingerprint) return existing;
    if (existing.projectSlug !== run.projectSlug || existing.idempotencyKey !== run.idempotencyKey || existing.inputFingerprint !== run.inputFingerprint || existing.compilerVersion !== run.compilerVersion || JSON.stringify(existing.sourceMessageIds) !== JSON.stringify(run.sourceMessageIds)) throw new Error("SEED_RUN_CONFLICT");
  } catch (error) {
    if (!(error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT")) throw error;
  }
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(run, null, 2)}\n`, "utf8");
  await fs.rename(temporary, target);
  return run;
}

export async function readSeedCompilationRun(root: string, runId: string): Promise<SeedCompilationRun | null> {
  try {
    const run = JSON.parse(await fs.readFile(runPath(root, runId), "utf8")) as SeedCompilationRun;
    assertSeedCompilationRunIntegrity(run, runId);
    return run;
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null;
    throw error;
  }
}
