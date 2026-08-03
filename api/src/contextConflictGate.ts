import crypto from "node:crypto";

export type ContextFactAuthority = "canon" | "projection" | "summary";
export interface ContextFact { factKey: string; value: unknown; sourceRef: string; sourceVersion: string; authority: ContextFactAuthority; valid: boolean; }
export interface ContextConflict { factKey: string; values: unknown[]; factRefs: string[]; authorityOrder: ContextFactAuthority[]; }
export interface ContextFactEvaluation { schemaVersion: "context-fact-evaluation.v1"; status: "pass" | "block"; deduplicated: ContextFact[]; conflicts: ContextConflict[]; invalidIgnored: string[]; authorityOrder: ContextFactAuthority[]; fingerprint: string; }

const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const authorityOrder: ContextFactAuthority[] = ["canon", "projection", "summary"];

export function evaluateContextFacts(input: { facts: ContextFact[] }): ContextFactEvaluation {
  if (input.facts.some((fact) => !fact.factKey.trim() || !fact.sourceRef.trim() || !fact.sourceVersion.trim() || !authorityOrder.includes(fact.authority))) throw new Error("CONTEXT_FACT_FIELDS_INVALID");
  const invalidIgnored = input.facts.filter((fact) => !fact.valid).map((fact) => fact.sourceRef);
  const validFacts = input.facts.filter((fact) => fact.valid);
  const grouped = new Map<string, ContextFact[]>();
  for (const fact of validFacts) grouped.set(fact.factKey, [...(grouped.get(fact.factKey) ?? []), fact]);
  const deduplicated: ContextFact[] = [];
  const conflicts: ContextConflict[] = [];
  for (const [factKey, facts] of grouped) {
    const byValue = new Map<string, ContextFact[]>();
    for (const fact of facts) byValue.set(JSON.stringify(fact.value), [...(byValue.get(JSON.stringify(fact.value)) ?? []), fact]);
    const ranked = [...facts].sort((a, b) => authorityOrder.indexOf(a.authority) - authorityOrder.indexOf(b.authority));
    deduplicated.push(ranked[0]);
    if (byValue.size > 1) conflicts.push({ factKey, values: [...byValue.values()].map((items) => items[0].value), factRefs: facts.map((fact) => fact.sourceRef), authorityOrder: [...new Set(ranked.map((fact) => fact.authority))] });
  }
  const base = { schemaVersion: "context-fact-evaluation.v1" as const, status: conflicts.length ? "block" as const : "pass" as const, deduplicated, conflicts, invalidIgnored, authorityOrder };
  return { ...base, fingerprint: hash(base) };
}

