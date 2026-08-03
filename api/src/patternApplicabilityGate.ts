export function evaluatePatternApplicability(input: { patternFunction: string; chapterFunction: string; compatible: boolean; reason: string }): { status: "applicable" | "excluded"; addToPrompt: boolean; reason: string } {
  if (!input.compatible) return { status: "excluded", addToPrompt: false, reason: input.reason || "BOUNDARY_MISMATCH" };
  return { status: "applicable", addToPrompt: true, reason: input.reason };
}
