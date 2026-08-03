export function evaluateUpstreamRepair(input: { understandingSnapshot: "valid" | "missing" | "corrupt"; defaultStoryIntentUsed: boolean; repairAvailable: boolean; legacyEditingAvailable: boolean }): { status: "ready" | "repair_required" | "blocked"; fallbackUsed: false; legacyEditingAvailable: boolean } {
  if (input.understandingSnapshot !== "valid") return { status: input.repairAvailable ? "repair_required" : "blocked", fallbackUsed: false, legacyEditingAvailable: input.legacyEditingAvailable };
  if (input.defaultStoryIntentUsed) return { status: "blocked", fallbackUsed: false, legacyEditingAvailable: input.legacyEditingAvailable };
  return { status: "ready", fallbackUsed: false, legacyEditingAvailable: input.legacyEditingAvailable };
}
