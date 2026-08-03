const requiredEvidence = ["schema", "api", "ui", "refresh_restart", "duplicate_message", "concurrent_answer", "projection_rebuild", "real_executor"] as const;
export function evaluateSliceEvidence(input: { evidence: readonly string[] }): { status: "verified" | "blocked"; missing: string[] } {
  const missing = requiredEvidence.filter((item) => !input.evidence.includes(item));
  return { status: missing.length ? "blocked" : "verified", missing };
}
