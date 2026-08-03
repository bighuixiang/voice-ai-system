export function proposeFeedbackScope(input: { text: string; currentSceneId: string; repeatedSceneIds: readonly string[] }): { currentScope: "scene"; proposal: "none" | "character-line-or-project-review"; evidenceCount: number } {
  if (!input.text.trim() || !input.currentSceneId.trim()) throw new Error("FEEDBACK_SCOPE_FIELDS_REQUIRED");
  const evidenceCount = new Set(input.repeatedSceneIds).size;
  return { currentScope: "scene", proposal: evidenceCount >= 3 ? "character-line-or-project-review" : "none", evidenceCount };
}
