export function reportAestheticEvidence(input: { dimension: string; blindSelectionEvidence: readonly string[]; proseEvidence: readonly string[]; stableScale: boolean }): { dimension: string; status: "evidence-supported" | "uncertain"; preciseScore: number | null; evidenceRefs: string[]; uncertainty: string[] } {
  if (!input.dimension.trim()) throw new Error("AESTHETIC_DIMENSION_REQUIRED");
  const evidenceRefs = [...input.blindSelectionEvidence, ...input.proseEvidence];
  const uncertain = !input.stableScale || !evidenceRefs.length;
  return { dimension: input.dimension, status: uncertain ? "uncertain" : "evidence-supported", preciseScore: null, evidenceRefs, uncertainty: uncertain ? ["NO_STABLE_PRECISE_SCALE"] : [] };
}
