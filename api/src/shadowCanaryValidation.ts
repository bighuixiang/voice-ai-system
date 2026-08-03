import crypto from "node:crypto";

export type ValidationMode = "shadow" | "canary";
export interface ShadowCanaryValidation {
  schemaVersion: "shadow-canary-validation.v1";
  validationId: string;
  candidateVersion: string;
  mode: ValidationMode;
  projectSlug?: string;
  authorAuthorized: boolean;
  canonWrites: false;
  status: "passed" | "failed" | "rolled-back";
  anomalyRefs: string[];
  rollbackTarget: string;
  evidenceRefs: string[];
  fingerprint: string;
}
const hash = (value: unknown): string => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function createShadowCanaryValidation(input: Omit<ShadowCanaryValidation, "schemaVersion" | "canonWrites" | "fingerprint">): ShadowCanaryValidation {
  if (!input.validationId.trim() || !input.candidateVersion.trim() || !input.rollbackTarget.trim() || !input.evidenceRefs.length || input.evidenceRefs.some((ref) => !ref.trim()) || input.anomalyRefs.some((ref) => !ref.trim()) || input.mode === "canary" && (!input.projectSlug?.trim() || !input.authorAuthorized)) throw new Error("SHADOW_CANARY_AUTHORIZATION_INVALID");
  if (input.status === "failed" && !input.anomalyRefs.length) throw new Error("SHADOW_CANARY_FAILURE_EVIDENCE_REQUIRED");
  const base = { schemaVersion: "shadow-canary-validation.v1" as const, ...input, anomalyRefs: [...input.anomalyRefs], evidenceRefs: [...input.evidenceRefs], canonWrites: false as const };
  return { ...base, fingerprint: hash(base) };
}

export function assertShadowCanaryValidationIntegrity(validation: ShadowCanaryValidation): void {
  if (validation.schemaVersion !== "shadow-canary-validation.v1" || validation.canonWrites !== false || !["shadow", "canary"].includes(validation.mode) || validation.mode === "canary" && (!validation.projectSlug?.trim() || !validation.authorAuthorized)) throw new Error("SHADOW_CANARY_INTEGRITY_FAILED");
  const { fingerprint: _fingerprint, ...base } = validation;
  if (!/^[a-f0-9]{64}$/i.test(validation.fingerprint) || hash(base) !== validation.fingerprint) throw new Error("SHADOW_CANARY_INTEGRITY_FAILED");
}
