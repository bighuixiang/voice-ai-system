export function evaluateForwardReadOnly(input: { eventType: string; degraded: boolean; replayable: boolean }): { status: "forward-read-only" | "normal" | "blocked"; writes: false } {
  if (input.degraded && !input.replayable) return { status: "blocked", writes: false };
  if (input.degraded) return { status: "forward-read-only", writes: false };
  return { status: "normal", writes: false };
}
