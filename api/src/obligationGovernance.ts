import crypto from "node:crypto";

export interface SourceCoverage { schemaVersion: "obligation-source-coverage.v1"; scannedSources: string[]; parsedSources: string[]; unresolvedSources: string[]; obligationCount: number; status: "covered" | "coverage_missing"; fingerprint: string; }
export interface ObligationWindowResult { schemaVersion: "obligation-window.v1"; obligationId: string; status: "within_window" | "risk" | "overdue" | "paid"; fingerprint: string; }
export interface RepairPlan { schemaVersion: "obligation-repair-plan.v1"; obligationId: string; recommended: { kind: string; impact: string; cost: number }; alternatives: Array<{ kind: string; impact: string; cost: number }>; fingerprint: string; }
export interface IntentionalOpen { schemaVersion: "intentional-open.v1"; obligationId: string; status: "intentional_open"; authorIntent: string; understoodRisk: string; fairnessEvidence: string[]; answeredSubclaims: string[]; sequelInheritance: boolean; fingerprint: string; }
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function assessObligationSourceCoverage(input: Omit<SourceCoverage, "schemaVersion" | "status" | "fingerprint">): SourceCoverage {
  if (!input.scannedSources.length) throw new Error("OBLIGATION_SOURCES_REQUIRED");
  const base = { schemaVersion: "obligation-source-coverage.v1" as const, ...input, scannedSources: [...input.scannedSources], parsedSources: [...input.parsedSources], unresolvedSources: [...input.unresolvedSources], status: input.unresolvedSources.length || input.parsedSources.length < input.scannedSources.length ? "coverage_missing" as const : "covered" as const };
  return { ...base, fingerprint: hash(base) };
}
export function evaluateObligationWindow(input: { obligationId: string; windowType: "chapter-range" | "milestone" | "condition"; currentMilestone: string; targetMilestone: string; hardness: "hard" | "soft"; paid: boolean }): ObligationWindowResult {
  if (!input.obligationId.trim() || !input.currentMilestone.trim() || !input.targetMilestone.trim()) throw new Error("OBLIGATION_WINDOW_FIELDS_REQUIRED");
  const status = input.paid ? "paid" as const : input.currentMilestone === input.targetMilestone ? input.hardness === "hard" ? "overdue" as const : "risk" as const : "within_window" as const;
  const base = { schemaVersion: "obligation-window.v1" as const, obligationId: input.obligationId, status };
  return { ...base, fingerprint: hash(base) };
}
export function planObligationRepair(input: { obligationId: string; routes: readonly Array<{ kind: string; impact: string; cost: number }> }): RepairPlan {
  if (!input.obligationId.trim() || !input.routes.length) throw new Error("OBLIGATION_REPAIR_ROUTES_REQUIRED");
  const alternatives = input.routes.map((route) => ({ ...route })); const recommended = [...alternatives].sort((left, right) => left.cost - right.cost || left.impact.localeCompare(right.impact))[0];
  const base = { schemaVersion: "obligation-repair-plan.v1" as const, obligationId: input.obligationId, recommended, alternatives };
  return { ...base, fingerprint: hash(base) };
}
export function authorizeIntentionalOpen(input: Omit<IntentionalOpen, "schemaVersion" | "status" | "fingerprint">): IntentionalOpen {
  if (!input.obligationId.trim() || !input.authorIntent.trim() || !input.understoodRisk.trim() || !input.fairnessEvidence.length || !input.answeredSubclaims.length) throw new Error("INTENTIONAL_OPEN_NOT_AUTHORIZED");
  const base = { schemaVersion: "intentional-open.v1" as const, ...input, fairnessEvidence: [...input.fairnessEvidence], answeredSubclaims: [...input.answeredSubclaims], status: "intentional_open" as const };
  return { ...base, fingerprint: hash(base) };
}
export function projectObligationVisibility(input: { authorSecret: string; collaborator: string; readerVisible: string; publicMetadata: string }, role: "author" | "collaborator" | "reader" | "public"): Record<string, string> {
  if (role === "author") return { secret: input.authorSecret, plan: input.collaborator, hint: input.readerVisible, label: input.publicMetadata };
  if (role === "collaborator") return { plan: input.collaborator, hint: input.readerVisible, label: input.publicMetadata };
  if (role === "reader") return { label: input.publicMetadata, hint: input.readerVisible };
  return { label: input.publicMetadata };
}
