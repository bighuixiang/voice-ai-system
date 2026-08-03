export function classifyPreferenceRevocation(input: { preferenceId: string; reason: string; canonChanged: boolean }): { preferenceId: string; cause: "story-premise-change" | "author-dislike" | "unknown"; negativePreferenceCreated: boolean } {
  if (!input.preferenceId.trim() || !input.reason.trim()) throw new Error("PREFERENCE_REVOCATION_FIELDS_REQUIRED");
  const cause = input.canonChanged ? "story-premise-change" : /讨厌|不喜欢|never|avoid/i.test(input.reason) ? "author-dislike" : "unknown";
  return { preferenceId: input.preferenceId, cause, negativePreferenceCreated: cause === "author-dislike" };
}
