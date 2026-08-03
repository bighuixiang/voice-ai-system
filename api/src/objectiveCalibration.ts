export function proposeObjectiveCalibration(input: { observations: readonly { scope: string; preference: "fast" | "detailed" }[] }): { status: "stable" | "calibration_required"; question?: string; scopes: string[] } {
  const scopes = [...new Set(input.observations.map((item) => item.scope))];
  const preferences = input.observations.map((item) => item.preference);
  const oscillating = preferences.length >= 3 && preferences.at(-1) === preferences.at(-3) && preferences.at(-1) !== preferences.at(-2);
  if (oscillating && scopes.length > 1) return { status: "calibration_required", question: "这些快/细偏好分别适用于哪些场景或阶段？", scopes };
  return { status: "stable", scopes };
}
