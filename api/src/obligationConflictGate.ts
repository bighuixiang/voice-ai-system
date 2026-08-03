import crypto from "node:crypto";

export interface ObligationConflictGate { schemaVersion: "obligation-conflict-gate.v1"; gateId: string; status: "blocked" | "cleared"; affectedWorkItemIds: string[]; alternatives: string[]; selectedAlternative?: string; fingerprint: string; }
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function evaluateObligationConflictGate(input: { gateId: string; affectedWorkItemIds: readonly string[]; alternatives: readonly string[]; selectedAlternative?: string; authorizationGranted?: boolean }): ObligationConflictGate {
  if (!input.gateId.trim() || !input.affectedWorkItemIds.length || input.alternatives.length < 2) throw new Error("OBLIGATION_CONFLICT_GATE_FIELDS_REQUIRED");
  const selected = input.selectedAlternative?.trim();
  const cleared = Boolean(selected && input.alternatives.includes(selected) && input.authorizationGranted === true);
  const base = { schemaVersion: "obligation-conflict-gate.v1" as const, gateId: input.gateId, status: cleared ? "cleared" as const : "blocked" as const, affectedWorkItemIds: [...new Set(input.affectedWorkItemIds)], alternatives: [...input.alternatives], ...(selected ? { selectedAlternative: selected } : {}) };
  return { ...base, fingerprint: hash(base) };
}
