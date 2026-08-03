import crypto from "node:crypto";

export interface ReversibleAssumptionRepair {
  schemaVersion: "reversible-assumption-repair.v1";
  assumptionId: string;
  status: "applied" | "revoked";
  affectedAssetIds: string[];
  changedAssetIds: string[];
  canonRewriteRequired: false;
  fingerprint: string;
}
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function applyScopedAssumptionRepair(input: { assumptionId: string; defaultValue: string; affectedAssetIds: readonly string[]; authorOverride?: { value: string; affectedAssetIds: string[] } }): ReversibleAssumptionRepair {
  if (!input.assumptionId.trim() || !input.defaultValue.trim() || !input.affectedAssetIds.length) throw new Error("REVERSIBLE_ASSUMPTION_FIELDS_REQUIRED");
  const scoped = [...new Set(input.affectedAssetIds.map(String).filter(Boolean))];
  const changed = input.authorOverride ? [...new Set(input.authorOverride.affectedAssetIds.map(String).filter((id) => scoped.includes(id)))] : scoped;
  const base = { schemaVersion: "reversible-assumption-repair.v1" as const, assumptionId: input.assumptionId, status: input.authorOverride ? "revoked" as const : "applied" as const, affectedAssetIds: scoped, changedAssetIds: changed, canonRewriteRequired: false as const };
  return { ...base, fingerprint: hash(base) };
}
