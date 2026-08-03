export interface BeatEvidenceGate { allowed: boolean; status: "planned" | "setup"; reason?: "PLAN_ONLY" | "PROSE_ANCHOR_REQUIRED"; evidenceRefs: string[]; }

/** Separates a planned beat from a beat actually planted in prose. */
export function evaluateBeatEvidence(input: { planned: boolean; evidenceRefs: readonly string[] }): BeatEvidenceGate {
  const evidenceRefs = [...input.evidenceRefs];
  if (input.planned && evidenceRefs.length === 0) return { allowed: false, status: "planned", reason: "PLAN_ONLY", evidenceRefs };
  const anchored = evidenceRefs.length > 0 && evidenceRefs.every((ref) => /^prose:\/\/[^\s#]+#[^\s]+$/i.test(ref));
  if (!anchored) return { allowed: false, status: "planned", reason: "PROSE_ANCHOR_REQUIRED", evidenceRefs };
  return { allowed: true, status: "setup", evidenceRefs };
}
