import crypto from "node:crypto";

export interface AdoptedSeedField { field: string; value: string; status: "adopted" | "unknown"; semanticId?: string; }
export interface SeedAdoptionResult { schemaVersion: "seed-adoption.v1"; fields: AdoptedSeedField[]; rejected: string[]; fingerprint: string; }
export interface IncrementalSeedRecompile { schemaVersion: "seed-incremental-recompile.v1"; recompiled: string[]; preserved: string[]; fingerprint: string; }
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const semanticId = (field: string) => `seed-field-${hash(field).slice(0, 12)}`;

export function adoptSeedFields(input: { existing: readonly AdoptedSeedField[]; decisions: readonly Array<{ field: string; value: string; decision: "accept" | "reject" }> }): SeedAdoptionResult {
  const fields = input.existing.map((field) => ({ ...field })); const rejected: string[] = [];
  for (const decision of input.decisions) {
    const index = fields.findIndex((field) => field.field === decision.field);
    if (decision.decision === "reject") { rejected.push(decision.field); continue; }
    const next = { field: decision.field, value: decision.value, status: "adopted" as const, semanticId: fields[index]?.semanticId ?? semanticId(decision.field) };
    if (index >= 0) fields[index] = next; else fields.push(next);
  }
  const base = { schemaVersion: "seed-adoption.v1" as const, fields, rejected };
  return { ...base, fingerprint: hash(base) };
}

export function recompileSeedIncrementally(input: { fields: readonly Array<{ field: string; value: string; version: number }>; changedFields: readonly string[]; dependencyMap: Record<string, readonly string[]> }): IncrementalSeedRecompile {
  const changed = new Set(input.changedFields); const recompiled = input.fields.filter((field) => changed.has(field.field) || (input.dependencyMap[field.field] ?? []).some((dependency) => changed.has(dependency))).map((field) => field.field); const base = { schemaVersion: "seed-incremental-recompile.v1" as const, recompiled, preserved: input.fields.map((field) => field.field).filter((field) => !recompiled.includes(field)) };
  return { ...base, fingerprint: hash(base) };
}
