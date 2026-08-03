export function evaluateGenerationAntiImitation(input: { beforeContext: readonly string[]; isolatedSourcePresent: boolean; promptInjectionPresent: boolean; approvedMechanismOnly: boolean; semanticSimilarity: number; structuralSimilarity: number; ngramSimilarity: number }): { status: "allowed" | "blocked" | "quarantine"; callsAllowed: boolean; patchAllowed: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (input.isolatedSourcePresent) reasons.push("ISOLATED_SOURCE_CONTEXT");
  if (input.promptInjectionPresent) reasons.push("PROMPT_INJECTION");
  if (!input.approvedMechanismOnly) reasons.push("UNAPPROVED_CONTEXT");
  if (input.beforeContext.some((text) => text.length > 1000)) reasons.push("LONG_SOURCE_EXCERPT");
  if (reasons.length) return { status: "blocked", callsAllowed: false, patchAllowed: false, reasons };
  if (input.semanticSimilarity >= 0.9 || input.structuralSimilarity >= 0.8 || input.ngramSimilarity >= 0.8) return { status: "quarantine", callsAllowed: true, patchAllowed: false, reasons: ["OUTPUT_NEAR_DUPLICATE"] };
  return { status: "allowed", callsAllowed: true, patchAllowed: true, reasons: [] };
}
