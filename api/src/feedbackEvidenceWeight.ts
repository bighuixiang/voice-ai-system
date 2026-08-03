export function classifyFeedbackEvidence(input: { decision: "accepted" | "rejected"; reason: string; sourceRef: string }): { strength: "weak" | "strong"; kind: "support" | "counter"; sourceRef: string; requiresCrossSampleValidation: true } {
  if (!input.sourceRef.trim()) throw new Error("FEEDBACK_SOURCE_REQUIRED");
  const strong = input.decision === "rejected" && input.reason.trim().length > 0;
  return { strength: strong ? "strong" : "weak", kind: input.decision === "accepted" ? "support" : "counter", sourceRef: input.sourceRef, requiresCrossSampleValidation: true };
}
