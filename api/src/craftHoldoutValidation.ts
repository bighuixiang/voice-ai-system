import crypto from "node:crypto";

export interface CraftHoldoutCase {
  caseId: string;
  sceneId: string;
  chapterFunction: string;
  inputFingerprint: string;
  labelSealed: boolean;
  generatorVisible: boolean;
  baselineScore: number;
  treatmentScore: number;
  hardGuardsPassed: boolean;
}

export interface CraftHoldoutInput {
  experimentId: string;
  extractionSceneIds: string[];
  cases: CraftHoldoutCase[];
  sourceRefs: string[];
}

export interface CraftHoldoutResult {
  schemaVersion: "craft-holdout-validation.v1";
  experimentId: string;
  status: "cross-scene-validated" | "local-candidate" | "blocked";
  holdoutCaseIds: string[];
  sceneFunctions: string[];
  improvementByCase: Record<string, number>;
  issues: string[];
  generatorInput: Array<{ caseId: string; inputFingerprint: string }>;
  sourceRefs: string[];
  fingerprint: string;
}

const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function assertCraftHoldoutIntegrity(record: CraftHoldoutResult): CraftHoldoutResult { const { fingerprint, ...content } = record; if (record.schemaVersion !== "craft-holdout-validation.v1" || hash(content) !== fingerprint) throw new Error("CRAFT_HOLDOUT_INTEGRITY_FAILED"); return record; }

export function validateCraftHoldout(input: CraftHoldoutInput): CraftHoldoutResult {
  if (!input.experimentId.trim()) throw new Error("CRAFT_HOLDOUT_EXPERIMENT_REQUIRED");
  if (!input.sourceRefs.length || input.sourceRefs.some((value) => !value.trim())) throw new Error("CRAFT_HOLDOUT_SOURCE_REQUIRED");
  if (input.cases.some((item) => !item.caseId.trim() || !item.sceneId.trim() || !item.chapterFunction.trim() || !item.inputFingerprint.trim() || !Number.isFinite(item.baselineScore) || !Number.isFinite(item.treatmentScore)) || new Set(input.cases.map((item) => item.caseId)).size !== input.cases.length) throw new Error("CRAFT_HOLDOUT_CASE_INVALID");
  const extraction = new Set(input.extractionSceneIds);
  const issues: string[] = [];
  if (!input.cases.length) issues.push("HOLDOUT_CASE_REQUIRED");
  if (input.cases.some((item) => extraction.has(item.sceneId))) issues.push("HOLDOUT_EXTRACTION_OVERLAP");
  if (input.cases.some((item) => !item.labelSealed || item.generatorVisible)) issues.push("HOLDOUT_LABEL_LEAK");
  const sceneFunctions = [...new Set(input.cases.map((item) => item.chapterFunction).filter(Boolean))].sort();
  if (sceneFunctions.length < 2) issues.push("CROSS_SCENE_FUNCTION_COVERAGE_REQUIRED");
  if (input.cases.some((item) => !item.hardGuardsPassed)) issues.push("HOLDOUT_HARD_GUARD_FAILED");
  const improvementByCase = Object.fromEntries(input.cases.map((item) => [item.caseId, Number((item.treatmentScore - item.baselineScore).toFixed(6))]));
  const status: CraftHoldoutResult["status"] = issues.some((issue) => issue === "HOLDOUT_EXTRACTION_OVERLAP" || issue === "HOLDOUT_LABEL_LEAK" || issue === "HOLDOUT_HARD_GUARD_FAILED")
    ? "blocked"
    : sceneFunctions.length >= 2 && input.cases.length >= 2 ? "cross-scene-validated" : "local-candidate";
  const base = { schemaVersion: "craft-holdout-validation.v1" as const, experimentId: input.experimentId, status, holdoutCaseIds: input.cases.map((item) => item.caseId), sceneFunctions, improvementByCase, issues, generatorInput: input.cases.map((item) => ({ caseId: item.caseId, inputFingerprint: item.inputFingerprint })), sourceRefs: [...input.sourceRefs] };
  return { ...base, fingerprint: hash(base) };
}
