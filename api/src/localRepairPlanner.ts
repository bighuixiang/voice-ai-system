import crypto from "node:crypto";

export type LocalRepairOperation = "replace-span" | "insert-sentence" | "delete-span" | "rewrite-paragraph" | "rewrite-chapter";
export interface LocalRepairPlan { schemaVersion: "local-repair-plan.v1"; planId: string; documentId: string; issueId: string; issueCode: string; span: { start: number; end: number; text: string }; operation: LocalRepairOperation; replacement: string; preserveContext: string[]; maxScope: "sentence" | "paragraph" | "scene" | "chapter"; authorAuthorization?: string; authorEvidenceRefs: string[]; status: "ready"; fingerprint: string; }
export interface LocalRepairValidation { schemaVersion: "local-repair-validation.v1"; planId: string; status: "ready" | "blocked"; issues: string[]; fingerprint: string; }
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function createLocalRepairPlan(input: Omit<LocalRepairPlan, "schemaVersion" | "status" | "fingerprint">): LocalRepairPlan {
  if (!input.planId.trim() || !input.documentId.trim() || !input.issueId.trim() || !input.issueCode.trim()) throw new Error("LOCAL_REPAIR_FIELDS_REQUIRED");
  if (input.span.start < 0 || input.span.end <= input.span.start || !input.span.text.trim()) throw new Error("LOCAL_REPAIR_SPAN_REQUIRED");
  if (!input.preserveContext.length) throw new Error("LOCAL_REPAIR_CONTEXT_REQUIRED");
  if (!input.authorEvidenceRefs.length) throw new Error("LOCAL_REPAIR_EVIDENCE_REQUIRED");
  if ((input.maxScope === "chapter" || input.operation === "rewrite-chapter") && !input.authorAuthorization?.trim()) throw new Error("LOCAL_REPAIR_SCOPE_TOO_BROAD");
  const base = { schemaVersion: "local-repair-plan.v1" as const, ...input, preserveContext: [...input.preserveContext], authorEvidenceRefs: [...input.authorEvidenceRefs], status: "ready" as const };
  return { ...base, fingerprint: hash(base) };
}
export function validateLocalRepairPlan(plan: LocalRepairPlan): LocalRepairValidation {
  const issues = [plan.preserveContext.length ? "" : "LOCAL_REPAIR_CONTEXT_REQUIRED", plan.authorEvidenceRefs.length ? "" : "LOCAL_REPAIR_EVIDENCE_REQUIRED"].filter(Boolean);
  const base = { schemaVersion: "local-repair-validation.v1" as const, planId: plan.planId, status: issues.length ? "blocked" as const : "ready" as const, issues };
  return { ...base, fingerprint: hash(base) };
}
