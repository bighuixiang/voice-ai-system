import crypto from "node:crypto";

export interface InferenceSafetyProjection {
  schemaVersion: "inference-safety-projection.v1";
  fields: Array<{ fieldId: string; text: string; epistemic: "author_fact" | "inferred" | "provisional"; contractEligible: boolean; source: "user" | "system-inference"; evidenceRefs: string[] }>;
  canonEligibleFieldIds: string[];
  fingerprint: string;
}
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function projectInferenceSafety(input: { fields: ReadonlyArray<{ fieldId: string; text: string; kind: "fact" | "inference" | "unknown"; source: "user" | "system-inference"; evidenceRefs: string[] }> }): InferenceSafetyProjection {
  if (!input.fields.length) throw new Error("INFERENCE_FIELDS_REQUIRED");
  const fields = input.fields.map((item) => {
    if (!item.fieldId.trim() || !item.text.trim() || !item.evidenceRefs.length) throw new Error("INFERENCE_FIELD_INVALID");
    if (item.kind === "fact" && item.source !== "user") throw new Error("INFERENCE_FACT_SOURCE_INVALID");
    const epistemic = item.kind === "fact" && item.source === "user" ? "author_fact" as const : item.kind === "unknown" ? "provisional" as const : "inferred" as const;
    return { ...item, epistemic, contractEligible: epistemic === "author_fact", evidenceRefs: [...item.evidenceRefs] };
  });
  const base = { schemaVersion: "inference-safety-projection.v1" as const, fields, canonEligibleFieldIds: fields.filter((item) => item.contractEligible).map((item) => item.fieldId) };
  return { ...base, fingerprint: hash(base) };
}
