import crypto from "node:crypto";

export interface StyleSignature {
  schemaVersion: "style-signature.v1";
  abstractWordRate: number;
  processWordRate: number;
  sentenceStartDistribution: Record<string, number>;
  dialogueTurnRate: number;
  hookTypeDistribution: Record<string, number>;
  sensoryChannelDistribution: Record<string, number>;
  characterVoiceDistance: number;
  sceneFunctionDistribution: Record<string, number>;
  fingerprint: string;
}

export interface StyleDriftResult { schemaVersion: "style-drift.v1"; status: "stable" | "anomaly"; anomalies: string[]; intentionalMotifsExcluded: string[]; fingerprint: string; }
const hash = (value: unknown): string => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function createStyleSignature(input: Omit<StyleSignature, "schemaVersion" | "fingerprint">): StyleSignature {
  const values = [input.abstractWordRate, input.processWordRate, input.dialogueTurnRate, input.characterVoiceDistance];
  if (!values.every((value) => Number.isFinite(value) && value >= 0) || !Object.values(input.sentenceStartDistribution).every((value) => Number.isFinite(value) && value >= 0) || !Object.values(input.hookTypeDistribution).every((value) => Number.isFinite(value) && value >= 0) || !Object.values(input.sensoryChannelDistribution).every((value) => Number.isFinite(value) && value >= 0) || !Object.values(input.sceneFunctionDistribution).every((value) => Number.isFinite(value) && value >= 0)) throw new Error("STYLE_SIGNATURE_INPUT_INVALID");
  const base = { schemaVersion: "style-signature.v1" as const, ...input, sentenceStartDistribution: { ...input.sentenceStartDistribution }, hookTypeDistribution: { ...input.hookTypeDistribution }, sensoryChannelDistribution: { ...input.sensoryChannelDistribution }, sceneFunctionDistribution: { ...input.sceneFunctionDistribution } };
  return { ...base, fingerprint: hash(base) };
}

export function detectStyleDrift(input: { baseline: StyleSignature; candidate: StyleSignature; threshold: number; intentionalMotifs?: string[] }): StyleDriftResult {
  if (!Number.isFinite(input.threshold) || input.threshold < 0) throw new Error("STYLE_DRIFT_THRESHOLD_INVALID");
  const excluded = new Set(input.intentionalMotifs || []);
  const anomalies: string[] = [];
  const compare = (key: keyof StyleSignature, label: string) => {
    const baseline = input.baseline[key]; const candidate = input.candidate[key];
    if (typeof baseline === "number" && typeof candidate === "number" && Math.abs(candidate - baseline) > input.threshold && !excluded.has(label)) anomalies.push(label);
  };
  compare("abstractWordRate", "abstract-word-rate"); compare("processWordRate", "process-word-rate"); compare("dialogueTurnRate", "dialogue-turn-rate"); compare("characterVoiceDistance", "character-voice-distance");
  const base = { schemaVersion: "style-drift.v1" as const, status: anomalies.length ? "anomaly" as const : "stable" as const, anomalies, intentionalMotifsExcluded: [...excluded] };
  return { ...base, fingerprint: hash(base) };
}
