import crypto from "node:crypto";

interface ContextRecordInput { payload?: { id?: string; sequence?: number; [key: string]: unknown }; raw?: string; fingerprint?: string; }
export interface ContextIntegrityResult { schemaVersion: "context-integrity-gate.v1"; status: "pass" | "block" | "warn"; validRecordIds: string[]; reasons: string[]; fingerprint: string; }
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function auditContextRecords(input: { authoritative: boolean; records: ContextRecordInput[] }): ContextIntegrityResult {
  const reasons: string[] = [];
  const validRecordIds: string[] = [];
  const sequences: number[] = [];
  for (const record of input.records) {
    let payload = record.payload;
    if (record.raw !== undefined) {
      try { payload = JSON.parse(record.raw) as ContextRecordInput["payload"]; } catch { reasons.push("MALFORMED_RECORD"); continue; }
    }
    const sequence = payload?.sequence;
    if (!payload?.id || typeof sequence !== "number" || !Number.isInteger(sequence) || sequence < 1) { reasons.push("MALFORMED_RECORD"); continue; }
    sequences.push(sequence);
    if (record.fingerprint !== hash(payload)) { reasons.push("HASH_MISMATCH"); continue; }
    validRecordIds.push(payload.id);
  }
  if (input.records.length && (!sequences.length || new Set(sequences).size !== sequences.length || Math.max(...sequences) !== input.records.length || sequences.length !== input.records.length || !sequences.every((sequence) => sequence >= 1))) reasons.push("SEQUENCE_GAP");
  const uniqueReasons = [...new Set(reasons)];
  const base = { schemaVersion: "context-integrity-gate.v1" as const, status: uniqueReasons.length ? input.authoritative ? "block" as const : "warn" as const : "pass" as const, validRecordIds: uniqueReasons.length ? [] : validRecordIds, reasons: uniqueReasons };
  return { ...base, fingerprint: hash(base) };
}
