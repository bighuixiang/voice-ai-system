export function attributeManualRevision(input: { revisionId: string; sceneId: string; compressedFrom: string; repeatedSceneIds: readonly string[]; probeValidated: boolean }): { revisionId: string; hypotheses: string[]; status: "mixed_hypothesis" | "scoped_preference_candidate"; scope: "scene" | "character-line"; promoted: boolean } {
  if (!input.revisionId.trim() || !input.sceneId.trim() || !input.compressedFrom.trim()) throw new Error("MANUAL_REVISION_ATTRIBUTION_FIELDS_REQUIRED");
  const repeated = new Set(input.repeatedSceneIds).size >= 3;
  const promoted = repeated && input.probeValidated;
  return { revisionId: input.revisionId, hypotheses: ["可能偏好少解释", "可能只是修复本场节奏"], status: promoted ? "scoped_preference_candidate" : "mixed_hypothesis", scope: promoted ? "character-line" : "scene", promoted };
}
