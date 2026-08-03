import crypto from "node:crypto";

export interface ModelCallFingerprint {
  schemaVersion: "model-call-fingerprint.v1";
  businessInputFingerprint: string;
  contextManifestFingerprint: string;
  routePolicyFingerprint: string;
  promptSchemaVersion: string;
  outputSchemaVersion: string;
  modelCapabilityRef: string;
  modelParameters: { temperature: number; topP: number; seed?: number };
  toolPermissions: string[];
  parentFingerprint?: string;
  fingerprint: string;
}

export interface ReplayFingerprintResult { schemaVersion: "model-call-replay-gate.v1"; status: "pass" | "block"; reasons: string[]; fingerprint: string; }
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function assertModelCallFingerprintIntegrity(record: ModelCallFingerprint): ModelCallFingerprint { const { fingerprint, ...base } = record; if (record.schemaVersion !== "model-call-fingerprint.v1" || !record.toolPermissions.every((permission) => permission.trim()) || hash(base) !== fingerprint) throw new Error("MODEL_CALL_FINGERPRINT_INTEGRITY_FAILED"); return record; }

export function createModelCallFingerprint(input: Omit<ModelCallFingerprint, "schemaVersion" | "fingerprint">): ModelCallFingerprint {
  if (![input.businessInputFingerprint, input.contextManifestFingerprint, input.routePolicyFingerprint, input.promptSchemaVersion, input.outputSchemaVersion, input.modelCapabilityRef].every((value) => value.trim())) throw new Error("MODEL_CALL_FINGERPRINT_FIELDS_REQUIRED");
  if (!Number.isFinite(input.modelParameters.temperature) || !Number.isFinite(input.modelParameters.topP) || input.modelParameters.temperature < 0 || input.modelParameters.topP <= 0 || input.modelParameters.topP > 1 || (input.modelParameters.seed !== undefined && !Number.isInteger(input.modelParameters.seed))) throw new Error("MODEL_CALL_PARAMETERS_INVALID");
  const base = { schemaVersion: "model-call-fingerprint.v1" as const, ...input, toolPermissions: [...new Set(input.toolPermissions)].sort() };
  return { ...base, fingerprint: hash(base) };
}

export function evaluateModelCallReplay(input: { expected: ModelCallFingerprint; actual: ModelCallFingerprint }): ReplayFingerprintResult {
  assertModelCallFingerprintIntegrity(input.expected);
  assertModelCallFingerprintIntegrity(input.actual);
  const reasons: string[] = [];
  const fields: Array<keyof ModelCallFingerprint> = ["businessInputFingerprint", "contextManifestFingerprint", "routePolicyFingerprint", "promptSchemaVersion", "outputSchemaVersion", "modelCapabilityRef", "modelParameters", "toolPermissions", "parentFingerprint"];
  for (const field of fields) if (JSON.stringify(input.expected[field]) !== JSON.stringify(input.actual[field])) reasons.push(`FINGERPRINT_${String(field).toUpperCase()}_MISMATCH`);
  if (input.expected.fingerprint !== input.actual.fingerprint) reasons.push("CALL_FINGERPRINT_MISMATCH");
  const base = { schemaVersion: "model-call-replay-gate.v1" as const, status: reasons.length ? "block" as const : "pass" as const, reasons: [...new Set(reasons)] };
  return { ...base, fingerprint: hash(base) };
}
