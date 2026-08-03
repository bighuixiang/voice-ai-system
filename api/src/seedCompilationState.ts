import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";

export type SeedCompilationStatus = "seed_captured" | "interpreting" | "clarification_required" | "contract_candidate_ready" | "contract_partially_adopted" | "contract_ready" | "repair_required";
export interface SeedCompilationState { schemaVersion: "seed-compilation-state.v1"; projectId: string; status: SeedCompilationStatus; storySkeletonReady: boolean; stableUnderstandingFingerprint?: string; failure?: { layer: string; message: string }; recoveryAction?: string; fingerprint: string; }
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const statePath = (root: string) => resolveInside(root, "sessions/seed-compilation-state.json");

function stateFingerprint(state: Omit<SeedCompilationState, "fingerprint">): string {
  return hash(state);
}

export function assertSeedCompilationStateIntegrity(value: unknown, expectedProjectId?: string): asserts value is SeedCompilationState {
  if (!value || typeof value !== "object") throw new Error("SEED_COMPILATION_STATE_INTEGRITY_FAILED");
  const state = value as Record<string, unknown>;
  const statuses: SeedCompilationStatus[] = ["seed_captured", "interpreting", "clarification_required", "contract_candidate_ready", "contract_partially_adopted", "contract_ready", "repair_required"];
  if (state.schemaVersion !== "seed-compilation-state.v1" || typeof state.projectId !== "string" || !state.projectId.trim() || (expectedProjectId && state.projectId !== expectedProjectId) || !statuses.includes(state.status as SeedCompilationStatus) || typeof state.storySkeletonReady !== "boolean" || typeof state.fingerprint !== "string") {
    throw new Error("SEED_COMPILATION_STATE_INTEGRITY_FAILED");
  }
  if (state.stableUnderstandingFingerprint !== undefined && (typeof state.stableUnderstandingFingerprint !== "string" || !state.stableUnderstandingFingerprint.trim())) throw new Error("SEED_COMPILATION_STATE_INTEGRITY_FAILED");
  if (state.failure !== undefined) {
    const failure = state.failure as Record<string, unknown>;
    if (!failure || typeof failure.layer !== "string" || !failure.layer.trim() || typeof failure.message !== "string" || !failure.message.trim()) throw new Error("SEED_COMPILATION_STATE_INTEGRITY_FAILED");
    if (typeof state.recoveryAction !== "string" || !state.recoveryAction.trim()) throw new Error("SEED_COMPILATION_STATE_INTEGRITY_FAILED");
  }
  const { fingerprint, ...base } = state as unknown as SeedCompilationState;
  if (stateFingerprint(base) !== fingerprint) throw new Error("SEED_COMPILATION_STATE_INTEGRITY_FAILED");
}

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

export function advanceSeedCompilationAfterInterpretation(state: SeedCompilationState, interpretationStatus: "unresolved" | "resolved"): SeedCompilationState {
  assertSeedCompilationStateIntegrity(state);
  if (state.status === "contract_ready" || state.status === "contract_partially_adopted" || state.status === "repair_required") return state;
  const status: SeedCompilationStatus = interpretationStatus === "resolved" ? "contract_candidate_ready" : "clarification_required";
  return createSeedCompilationState({ projectId: state.projectId, status, stableUnderstandingFingerprint: state.stableUnderstandingFingerprint });
}

export function deriveSeedStateAfterAdoption(state: SeedCompilationState, adoptedAnyField: boolean): SeedCompilationState {
  assertSeedCompilationStateIntegrity(state);
  if (state.status === "contract_ready" || state.status === "contract_partially_adopted" || state.status === "repair_required") return state;
  return createSeedCompilationState({ projectId: state.projectId, status: adoptedAnyField ? "contract_partially_adopted" : "clarification_required", stableUnderstandingFingerprint: state.stableUnderstandingFingerprint });
}

export function deriveSeedStateAfterRevocation(state: SeedCompilationState): SeedCompilationState {
  assertSeedCompilationStateIntegrity(state);
  if (state.status === "contract_ready" || state.status === "repair_required") return state;
  return createSeedCompilationState({ projectId: state.projectId, status: "clarification_required", stableUnderstandingFingerprint: state.stableUnderstandingFingerprint });
}

export async function persistSeedCompilationState(root: string, state: SeedCompilationState): Promise<SeedCompilationState> {
  assertSeedCompilationStateIntegrity(state);
  const target = statePath(root);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  await fs.rename(temporary, target);
  return state;
}

export async function readSeedCompilationState(root: string, expectedProjectId?: string): Promise<SeedCompilationState | null> {
  try {
    const parsed = JSON.parse(await fs.readFile(statePath(root), "utf8")) as unknown;
    assertSeedCompilationStateIntegrity(parsed, expectedProjectId);
    return parsed;
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null;
    throw error;
  }
}
