const normalize = (text: string) => text.toLocaleLowerCase().replace(/[，。！？、,.!?\s]/g, "");
export function detectAbstractAntiGoal(input: { text: string; antiGoal: "命运齿轮模板钩子"; evidenceRef: string }): { status: "repair-required" | "passed"; matched: boolean; evidenceRef: string } {
  if (!input.text.trim() || !input.evidenceRef.trim()) throw new Error("ANTI_GOAL_SEMANTIC_FIELDS_REQUIRED");
  const text = normalize(input.text);
  const matched = ((text.includes("不知道") || text.includes("无人知晓")) && (text.includes("命运") || text.includes("风暴") || text.includes("齿轮"))) || text.includes("一切才刚刚开始");
  return { status: matched ? "repair-required" : "passed", matched, evidenceRef: input.evidenceRef };
}
