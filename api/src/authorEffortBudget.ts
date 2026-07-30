import crypto from "node:crypto";

export type EffortPhase = "exploration" | "writing" | "audit";
export type EffortKind = "active-question" | "review-item" | "interruption" | "readable-unit" | "low-value-decision" | "hard-gate";
interface EffortCounters { activeQuestions: number; reviewItems: number; interruptions: number; readableUnits: number; lowValueDecisions: number; }
interface EffortLimits { activeQuestions: number; reviewItems: number; interruptions: number; readableUnits: number; lowValueDecisions: number; }
export interface AuthorEffortBudget { schemaVersion: "author-effort-budget.v1"; projectSlug: string; phase: EffortPhase; limits: EffortLimits; used: EffortCounters; strategyVersion: string; fingerprint: string; }
export interface EffortReceipt { schemaVersion: "author-effort-receipt.v1"; kind: EffortKind; amount: number; reason: string; strategyVersion: string; fingerprint: string; }
export interface EffortConsumption { status: "allowed" | "blocked"; reason?: "effort-budget-exceeded"; budget: AuthorEffortBudget; receipt?: EffortReceipt; }
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const defaults: Record<EffortPhase, EffortLimits> = { exploration: { activeQuestions: 2, reviewItems: 3, interruptions: 2, readableUnits: 3500, lowValueDecisions: 2 }, writing: { activeQuestions: 1, reviewItems: 4, interruptions: 1, readableUnits: 2500, lowValueDecisions: 1 }, audit: { activeQuestions: 1, reviewItems: 6, interruptions: 1, readableUnits: 5000, lowValueDecisions: 0 } };
function fingerprint(base: Omit<AuthorEffortBudget, "fingerprint"> | AuthorEffortBudget) {
  const { fingerprint: _fingerprint, ...canonical } = base as AuthorEffortBudget;
  return hash(canonical);
}
export function createAuthorEffortBudget(input: { projectSlug: string; phase: EffortPhase }): AuthorEffortBudget {
  if (!input.projectSlug.trim()) throw new Error("EFFORT_PROJECT_REQUIRED");
  const base = { schemaVersion: "author-effort-budget.v1" as const, projectSlug: input.projectSlug, phase: input.phase, limits: { ...defaults[input.phase] }, used: { activeQuestions: 0, reviewItems: 0, interruptions: 0, readableUnits: 0, lowValueDecisions: 0 }, strategyVersion: `effort-${input.phase}-v1` };
  return { ...base, fingerprint: fingerprint(base) };
}
export function applyAuthorEffortPreference(budget: AuthorEffortBudget, preference: "less-questioning" | "more-detail"): AuthorEffortBudget {
  const limits = { ...budget.limits };
  if (preference === "less-questioning") limits.activeQuestions = Math.max(1, limits.activeQuestions - 1);
  else { limits.reviewItems += 2; limits.readableUnits += 1000; }
  const base = { ...budget, limits, strategyVersion: `${budget.strategyVersion}:${preference}` };
  return { ...base, fingerprint: fingerprint(base) };
}
export function consumeAuthorEffort(budget: AuthorEffortBudget, input: { kind: EffortKind; amount: number; reason: string }): EffortConsumption {
  if (!Number.isFinite(input.amount) || input.amount <= 0 || !input.reason.trim()) throw new Error("EFFORT_CONSUMPTION_INVALID");
  if (input.kind === "hard-gate") return { status: "allowed", budget };
  const key: Record<Exclude<EffortKind, "hard-gate">, keyof EffortCounters> = { "active-question": "activeQuestions", "review-item": "reviewItems", interruption: "interruptions", "readable-unit": "readableUnits", "low-value-decision": "lowValueDecisions" };
  const counter = key[input.kind];
  if (budget.used[counter] + input.amount > budget.limits[counter]) return { status: "blocked", reason: "effort-budget-exceeded", budget };
  const used = { ...budget.used, [counter]: budget.used[counter] + input.amount };
  const nextBase = { ...budget, used };
  const next = { ...nextBase, fingerprint: fingerprint(nextBase) };
  const receiptBase = { schemaVersion: "author-effort-receipt.v1" as const, kind: input.kind, amount: input.amount, reason: input.reason, strategyVersion: budget.strategyVersion };
  return { status: "allowed", budget: next, receipt: { ...receiptBase, fingerprint: hash(receiptBase) } };
}
