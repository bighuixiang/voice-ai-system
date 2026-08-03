export function evaluatePatternEvidence(input: { positiveEvidence: readonly string[]; counterexamples: readonly string[]; boundaries: readonly string[] }): { status: "candidate" | "approved"; missing: string[] } {
  const missing = [input.positiveEvidence.length ? "" : "positiveEvidence", input.counterexamples.length ? "" : "counterexamples", input.boundaries.length ? "" : "boundaries"].filter(Boolean);
  return { status: missing.length ? "candidate" : "approved", missing };
}
