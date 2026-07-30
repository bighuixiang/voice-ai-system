import crypto from "node:crypto";

export type ContextDataClass = "author-text" | "project-file" | "imported" | "retrieval" | "model-output";
export interface ContextPrivacySource { sourceId: string; projectSlug: string; content: string; dataClass: ContextDataClass; rights: "project-authorized" | "unauthorized"; providerAuthorized: boolean; deleted: boolean; }
export interface ContextPrivacyResult { schemaVersion: "context-privacy-gate.v1"; projectSlug: string; purpose: string; status: "pass" | "block"; includedSourceIds: string[]; blockedSourceIds: string[]; reasons: string[]; dataBoundary: "untrusted-data-only"; fingerprint: string; }

const secretPattern = /(sk-[A-Za-z0-9_-]{8,}|(?:api[_ -]?key|token|bearer)\s*[:=]\s*[^\s]+|(?:[A-Za-z]:\\|\/Users\/|\/home\/)[^\s]+)/iu;
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function evaluateContextPrivacy(input: { projectSlug: string; purpose: string; sources: ContextPrivacySource[] }): ContextPrivacyResult {
  if (!input.projectSlug.trim() || !input.purpose.trim()) throw new Error("CONTEXT_PRIVACY_INPUT_REQUIRED");
  const reasons: string[] = [];
  const blockedSourceIds: string[] = [];
  const includedSourceIds: string[] = [];
  for (const source of input.sources) {
    const sourceReasons: string[] = [];
    if (source.projectSlug !== input.projectSlug) sourceReasons.push("PROJECT_SCOPE_VIOLATION");
    if (source.rights !== "project-authorized" || !source.providerAuthorized) sourceReasons.push("SOURCE_AUTHORIZATION_REQUIRED");
    if (source.deleted) sourceReasons.push("SOURCE_DELETED");
    if (secretPattern.test(source.content)) sourceReasons.push("SECRET_DETECTED");
    if (sourceReasons.length) { blockedSourceIds.push(source.sourceId); reasons.push(...sourceReasons); } else includedSourceIds.push(source.sourceId);
  }
  const base = { schemaVersion: "context-privacy-gate.v1" as const, projectSlug: input.projectSlug, purpose: input.purpose, status: blockedSourceIds.length ? "block" as const : "pass" as const, includedSourceIds, blockedSourceIds, reasons: [...new Set(reasons)], dataBoundary: "untrusted-data-only" as const };
  return { ...base, fingerprint: hash(base) };
}
