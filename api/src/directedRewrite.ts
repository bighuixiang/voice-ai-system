import crypto from "node:crypto";

export interface DirectedRewrite { schemaVersion: "directed-rewrite.v1"; rewriteId: string; sourceCandidateId: string; original: string; directives: string[]; protectedAnchors: string[]; changedSegments: Array<{ before: string; after: string }>; rationale: string; evidenceRefs: string[]; status: "candidate"; fingerprint: string; }
export interface DirectedRewriteValidation { schemaVersion: "directed-rewrite-validation.v1"; rewriteId: string; status: "ready" | "blocked"; issues: string[]; fingerprint: string; }
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function createDirectedRewrite(input: Omit<DirectedRewrite, "schemaVersion" | "status" | "fingerprint">): DirectedRewrite {
  if (!input.rewriteId.trim() || !input.sourceCandidateId.trim() || !input.original.trim() || !input.rationale.trim()) throw new Error("DIRECTED_REWRITE_FIELDS_REQUIRED");
  if (!input.directives.length) throw new Error("DIRECTED_REWRITE_DIRECTIVES_REQUIRED");
  if (!input.evidenceRefs.length) throw new Error("DIRECTED_REWRITE_EVIDENCE_REQUIRED");
  const base = { schemaVersion: "directed-rewrite.v1" as const, ...input, directives: [...input.directives], protectedAnchors: [...input.protectedAnchors], changedSegments: input.changedSegments.map((segment) => ({ ...segment })), evidenceRefs: [...input.evidenceRefs], status: "candidate" as const };
  return { ...base, fingerprint: hash(base) };
}
export function validateDirectedRewrite(rewrite: DirectedRewrite): DirectedRewriteValidation {
  const issues = rewrite.protectedAnchors.some((anchor) => rewrite.changedSegments.some((segment) => segment.before.includes(anchor) && !segment.after.includes(anchor))) ? ["DIRECTED_REWRITE_PROTECTED_ANCHOR_CHANGED"] : [];
  const base = { schemaVersion: "directed-rewrite-validation.v1" as const, rewriteId: rewrite.rewriteId, status: issues.length ? "blocked" as const : "ready" as const, issues };
  return { ...base, fingerprint: hash(base) };
}
