export interface PreferenceHypothesis { hypothesisId: string; text: string; supports: string[]; counterEvidence: string[]; scope: string; status: "active" | "retired"; }
export function updatePreferenceHypothesis(input: { hypothesis: PreferenceHypothesis; evidenceRef: string; evidenceKind: "support" | "counter"; context: string }): PreferenceHypothesis {
  if (!input.evidenceRef.trim() || !input.context.trim()) throw new Error("PREFERENCE_EVIDENCE_FIELDS_REQUIRED");
  const h = input.hypothesis;
  if (input.evidenceKind === "counter") return { ...h, counterEvidence: [...new Set([...h.counterEvidence, input.evidenceRef])], scope: `${h.scope};excluded:${input.context}`, status: h.status };
  return { ...h, supports: [...new Set([...h.supports, input.evidenceRef])] };
}
