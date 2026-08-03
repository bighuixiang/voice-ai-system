import crypto from "node:crypto";

export type EmotionIntensity = "low" | "medium" | "high";
export interface EmotionCausalityInput { sceneId: string; characterId: string; intensity: EmotionIntensity; trigger: string; bodyAttention: string; interpretation: string; choice: string; aftermath: { character: string; relationship: string; nextAction: string }; proseEvidenceRefs: string[]; }
export interface EmotionCausalityReport { schemaVersion: "emotion-causality-report.v1"; sceneId: string; characterId: string; status: "passed" | "blocked"; issues: string[]; checks: Array<{ checkId: "trigger" | "process" | "interpretation" | "choice" | "aftermath" | "evidence"; status: "passed" | "failed" }>; fingerprint: string; }
function hash(value: unknown) { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
export function evaluateEmotionCausality(input: EmotionCausalityInput): EmotionCausalityReport {
  const issues: string[] = [];
  const checks: EmotionCausalityReport["checks"] = [];
  if (!input.sceneId.trim() || !input.characterId.trim()) issues.push("EMOTION_CONTEXT_REQUIRED");
  if (!["low", "medium", "high"].includes(input.intensity)) issues.push("EMOTION_INTENSITY_INVALID");
  const add = (checkId: EmotionCausalityReport["checks"][number]["checkId"], pass: boolean, issue: string) => { checks.push({ checkId, status: pass ? "passed" : "failed" }); if (!pass) issues.push(issue); };
  add("trigger", Boolean(input.trigger.trim()), "EMOTION_TRIGGER_REQUIRED");
  const process = Boolean(input.bodyAttention.trim()) && !/^浠?寰堢棝鑻?|^濂?寰堥渿鎯?/.test(input.interpretation.trim());
  add("process", process, "EMOTION_PROCESS_REQUIRED");
  add("interpretation", Boolean(input.interpretation.trim()), "EMOTION_INTERPRETATION_REQUIRED");
  add("choice", Boolean(input.choice.trim()), "EMOTION_CHOICE_REQUIRED");
  add("aftermath", Boolean(input.aftermath.character.trim() && input.aftermath.relationship.trim() && input.aftermath.nextAction.trim()), "EMOTION_AFTERSHOCK_REQUIRED");
  add("evidence", input.proseEvidenceRefs.length > 0 && input.proseEvidenceRefs.every((ref) => ref.trim()), "EMOTION_EVIDENCE_REQUIRED");
  const base = { schemaVersion: "emotion-causality-report.v1" as const, sceneId: input.sceneId, characterId: input.characterId, status: issues.length ? "blocked" as const : "passed" as const, issues: [...new Set(issues)], checks };
  return { ...base, fingerprint: hash(base) };
}
