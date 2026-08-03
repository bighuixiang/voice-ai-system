export function resolveScopedObjective(input: { basePreference: string; chapterId: string; requestedChapterId: string; override?: { chapterId: string; preference: string; reason: string } }): { preference: string; source: "base" | "chapter-override"; restored: boolean } {
  if (!input.basePreference.trim() || !input.chapterId.trim() || !input.requestedChapterId.trim()) throw new Error("OBJECTIVE_SCOPE_FIELDS_REQUIRED");
  if (input.override && input.override.chapterId === input.requestedChapterId) return { preference: input.override.preference, source: "chapter-override", restored: false };
  return { preference: input.basePreference, source: "base", restored: Boolean(input.override) };
}
