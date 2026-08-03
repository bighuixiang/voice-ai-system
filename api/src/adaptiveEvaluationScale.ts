import crypto from "node:crypto";

export type ChapterFunction = "climax" | "aftermath" | "life" | "bridge" | "puzzle";
export type EvaluationDimension = "conflict" | "rhythm" | "cost" | "emotion" | "relationship" | "humanity" | "information-flow" | "necessity" | "fair-clues" | "cognitive-change";

const dimensions: Record<ChapterFunction, EvaluationDimension[]> = {
  climax: ["conflict", "rhythm", "cost"],
  aftermath: ["emotion", "relationship", "cost"],
  life: ["humanity", "relationship", "information-flow"],
  bridge: ["necessity", "rhythm", "information-flow"],
  puzzle: ["fair-clues", "cognitive-change", "rhythm"]
};

export interface AdaptiveEvaluationScale {
  schemaVersion: "adaptive-evaluation-scale.v1";
  chapterFunction: ChapterFunction;
  dimensions: Array<{ dimension: EvaluationDimension; score: number | null; status: "applicable" | "not_applicable" }>;
  average: number | null;
  fingerprint: string;
}

const hash = (value: unknown): string => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function assertAdaptiveEvaluationScaleIntegrity(scale: AdaptiveEvaluationScale): void {
  if (scale.schemaVersion !== "adaptive-evaluation-scale.v1" || !dimensions[scale.chapterFunction] || !Array.isArray(scale.dimensions)) throw new Error("EVALUATION_SCALE_INVALID");
  const applicable = scale.dimensions.filter((item) => item.status === "applicable");
  if (applicable.some((item) => item.score === null || !Number.isFinite(item.score) || item.score < 0 || item.score > 1) || (scale.average !== null && (!Number.isFinite(scale.average) || scale.average < 0 || scale.average > 1))) throw new Error("EVALUATION_SCALE_INVALID");
  const { fingerprint: _fingerprint, ...base } = scale;
  if (!/^[a-f0-9]{64}$/i.test(scale.fingerprint) || hash(base) !== scale.fingerprint) throw new Error("EVALUATION_SCALE_INTEGRITY_FAILED");
}

export function buildAdaptiveEvaluationScale(input: { chapterFunction: ChapterFunction; scores: Partial<Record<EvaluationDimension, number | null>> }): AdaptiveEvaluationScale {
  if (!dimensions[input.chapterFunction]) throw new Error("EVALUATION_CHAPTER_FUNCTION_INVALID");
  const active = dimensions[input.chapterFunction];
  const known = new Set(Object.values(dimensions).flat());
  if (Object.keys(input.scores).some((dimension) => !known.has(dimension as EvaluationDimension))) throw new Error("EVALUATION_DIMENSION_INVALID");
  const allDimensions = [...new Set([...active, ...Object.keys(input.scores)])] as EvaluationDimension[];
  const result = allDimensions.map((dimension) => {
    const score = input.scores[dimension] ?? null;
    if (score !== null && (!Number.isFinite(score) || score < 0 || score > 1)) throw new Error("EVALUATION_SCORE_INVALID");
    return { dimension, score: active.includes(dimension) ? score : null, status: active.includes(dimension) && score !== null ? "applicable" as const : "not_applicable" as const };
  });
  const applicable = result.filter((item) => item.status === "applicable").map((item) => item.score as number);
  const base = { schemaVersion: "adaptive-evaluation-scale.v1" as const, chapterFunction: input.chapterFunction, dimensions: result, average: applicable.length ? applicable.reduce((sum, score) => sum + score, 0) / applicable.length : null };
  return { ...base, fingerprint: hash(base) };
}
