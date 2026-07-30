import crypto from "node:crypto";

export interface IntentCorrection { schemaVersion: "intent-correction.v1"; correctionId: string; priorInterpretation: string; correctedInterpretation: string; affectedAssets: string[]; recommendation: string; status: "proposed" | "accepted"; fingerprint: string; }
type DownstreamArtifact = { id: string; affectedAssets: string[]; status: string };
export interface IntentCorrectionPropagationInput {
  understanding: DownstreamArtifact[];
  questions: DownstreamArtifact[];
  plans: DownstreamArtifact[];
  candidates: DownstreamArtifact[];
  tasks: DownstreamArtifact[];
  patches: DownstreamArtifact[];
}
export interface IntentCorrectionPropagation {
  schemaVersion: "intent-correction-propagation.v1";
  correctionId: string;
  correctedInterpretation: string;
  minimalUnderstanding: string;
  affected: Record<keyof IntentCorrectionPropagationInput, string[]>;
  transitions: Array<{ artifactId: string; artifactType: string; from: string; to: "stale" | "paused" }>;
  recurrenceGuard: string[];
  fingerprint: string;
}
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function createIntentCorrection(input: Omit<IntentCorrection, "schemaVersion" | "fingerprint" | "status"> & { status?: IntentCorrection["status"] }): IntentCorrection {
  if (!input.correctionId.trim() || !input.priorInterpretation.trim() || !input.correctedInterpretation.trim() || !input.affectedAssets.length || !input.recommendation.trim()) throw new Error("INTENT_CORRECTION_FIELDS_REQUIRED");
  const base = { schemaVersion: "intent-correction.v1" as const, correctionId: input.correctionId, priorInterpretation: input.priorInterpretation, correctedInterpretation: input.correctedInterpretation, affectedAssets: [...input.affectedAssets], recommendation: input.recommendation, status: input.status ?? "proposed" as const };
  return { ...base, fingerprint: hash(base) };
}

export function propagateIntentCorrection(correction: IntentCorrection, input: IntentCorrectionPropagationInput): IntentCorrectionPropagation {
  const affectedAssets = new Set(correction.affectedAssets);
  const affected = {} as Record<keyof IntentCorrectionPropagationInput, string[]>;
  const transitions: IntentCorrectionPropagation["transitions"] = [];
  const singular: Record<keyof IntentCorrectionPropagationInput, string> = { understanding: "understanding", questions: "question", plans: "plan", candidates: "candidate", tasks: "task", patches: "patch" };
  (Object.keys(input) as Array<keyof IntentCorrectionPropagationInput>).forEach((artifactType) => {
    affected[artifactType] = input[artifactType].filter((artifact) => artifact.affectedAssets.some((asset) => affectedAssets.has(asset))).map((artifact) => artifact.id);
    for (const artifact of input[artifactType]) {
      if (!affected[artifactType].includes(artifact.id)) continue;
      transitions.push({ artifactId: artifact.id, artifactType: singular[artifactType], from: artifact.status, to: artifactType === "tasks" && artifact.status === "running" ? "paused" : "stale" });
    }
  });
  const base = {
    schemaVersion: "intent-correction-propagation.v1" as const,
    correctionId: correction.correctionId,
    correctedInterpretation: correction.correctedInterpretation,
    minimalUnderstanding: correction.correctedInterpretation,
    affected,
    transitions,
    recurrenceGuard: [correction.correctionId]
  };
  return { ...base, fingerprint: hash(base) };
}
