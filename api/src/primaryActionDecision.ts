import crypto from "node:crypto";

export type PrimaryActionKind = "safety-conflict" | "l2-decision" | "recovery" | "reviewable" | "continue" | "exploration";
export type PrimaryActionLifecycle = "ready" | "submitted" | "running" | "reviewable" | "blocked" | "failed" | "settled";
export interface PrimaryActionCandidate { actionId: string; kind: PrimaryActionKind; label: string; rationale: string; preconditions: string[]; targetOutcome: string; allowedCommands: string[]; risk: "low" | "medium" | "high"; lifecycle: "ready"; }
export interface PrimaryActionDecision {
  schemaVersion: "primary-action-decision.v1";
  actionId: string;
  journeyVersion: string;
  sourceFingerprint: string;
  kind: PrimaryActionKind;
  label: string;
  rationale: string;
  priorityEvidence: string[];
  preconditions: string[];
  blockingReasons: string[];
  targetOutcome: string;
  allowedCommands: string[];
  risk: "low" | "medium" | "high";
  idempotencyKey: string;
  lifecycle: PrimaryActionLifecycle;
  status: "ready" | "blocked";
  fingerprint: string;
}
const priority: Record<PrimaryActionKind, number> = { "safety-conflict": 0, "l2-decision": 1, recovery: 2, reviewable: 3, continue: 4, exploration: 5 };
const transitions: Record<PrimaryActionLifecycle, PrimaryActionLifecycle[]> = { ready: ["submitted", "blocked"], submitted: ["running", "failed", "blocked"], running: ["reviewable", "failed", "blocked", "settled"], reviewable: ["settled", "failed"], blocked: ["ready", "failed"], failed: ["ready"], settled: [] };
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function createPrimaryActionDecision(input: { journeyVersion: string; sourceFingerprint: string; candidates: readonly PrimaryActionCandidate[] }): PrimaryActionDecision {
  if (!input.journeyVersion.trim() || !input.sourceFingerprint.trim() || !input.candidates.length) throw new Error("PRIMARY_ACTION_CANDIDATES_REQUIRED");
  const selected = [...input.candidates].sort((a, b) => priority[a.kind] - priority[b.kind] || a.actionId.localeCompare(b.actionId))[0];
  const blockingReasons = [...selected.preconditions];
  const base = { schemaVersion: "primary-action-decision.v1" as const, actionId: selected.actionId, journeyVersion: input.journeyVersion, sourceFingerprint: input.sourceFingerprint, kind: selected.kind, label: selected.label, rationale: selected.rationale, priorityEvidence: [selected.kind], preconditions: [...selected.preconditions], blockingReasons, targetOutcome: selected.targetOutcome, allowedCommands: [...selected.allowedCommands], risk: selected.risk, idempotencyKey: `primary-action-${hash({ actionId: selected.actionId, journeyVersion: input.journeyVersion }).slice(0, 24)}`, lifecycle: blockingReasons.length ? "blocked" as const : "ready" as const, status: blockingReasons.length ? "blocked" as const : "ready" as const };
  return { ...base, fingerprint: hash(base) };
}

export function validatePrimaryActionSubmission(decision: PrimaryActionDecision, input: { actionId: string; journeyVersion: string; sourceFingerprint: string }): { accepted: boolean; reason?: "action-mismatch" | "journey-stale" | "source-stale" | "decision-blocked"; idempotencyKey?: string } {
  if (decision.actionId !== input.actionId) return { accepted: false, reason: "action-mismatch" };
  if (decision.journeyVersion !== input.journeyVersion) return { accepted: false, reason: "journey-stale" };
  if (decision.sourceFingerprint !== input.sourceFingerprint) return { accepted: false, reason: "source-stale" };
  if (decision.status === "blocked" || decision.lifecycle === "blocked") return { accepted: false, reason: "decision-blocked" };
  return { accepted: true, idempotencyKey: decision.idempotencyKey };
}

export function advancePrimaryAction(decision: PrimaryActionDecision, next: PrimaryActionLifecycle): PrimaryActionDecision {
  if (!transitions[decision.lifecycle].includes(next)) throw new Error("PRIMARY_ACTION_LIFECYCLE_INVALID");
  const base = { ...decision, lifecycle: next, status: next === "blocked" ? "blocked" as const : "ready" as const };
  return { ...base, fingerprint: hash(base) };
}
