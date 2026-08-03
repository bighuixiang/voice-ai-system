export function createConfoundedFeedbackProbe(input: { candidateId: string; changedDimensions: readonly string[]; authorRejected: boolean }): { status: "confounded" | "not-confounded"; frozenDimensions: string[]; probeDimension: string | null } {
  if (!input.candidateId.trim() || !input.changedDimensions.length) throw new Error("CONFOUNDED_FEEDBACK_FIELDS_REQUIRED");
  const confounded = input.authorRejected && input.changedDimensions.length > 1;
  return { status: confounded ? "confounded" : "not-confounded", frozenDimensions: confounded ? input.changedDimensions.filter((dimension) => dimension !== "pov") : [], probeDimension: confounded ? "pov" : null };
}
