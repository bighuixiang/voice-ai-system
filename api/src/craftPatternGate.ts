export function evaluateCraftPattern(input: { trigger: string; informationChange: string; characterChoice: string; readerEffect: string; cost: string; boundary: string; counterexample: string }): { status: "candidate" | "blocked"; missing: string[] } {
  const fields = ["trigger", "informationChange", "characterChoice", "readerEffect", "cost", "boundary", "counterexample"] as const;
  const missing = fields.filter((field) => !input[field].trim());
  return { status: missing.length ? "blocked" : "candidate", missing };
}
