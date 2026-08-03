import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import type { DialogueQuestion } from "./dialogueQuestions.js";

export interface RedBlueOption {
  optionId: string;
  label: string;
  claim: string;
  bestCase: string;
  premises: string[];
  evidenceRefs: string[];
  failureModes: string[];
  opportunityCost: string;
  reversibility: string;
  affectedDecisions: string[];
  uncertainty: string;
}

export interface DialogueRedBlueCase {
  schemaVersion: "dialogue-red-blue-case.v1";
  caseId: string;
  projectSlug: string;
  questionId: string;
  questionVersion: number;
  questionFingerprint: string;
  options: RedBlueOption[];
  sharedFacts: string[];
  irreducibleTradeoff: string;
  recommendation: string;
  recommendationReason: string;
  dissent: string[];
  whatWouldChangeRecommendation: string[];
  status: "open" | "superseded";
  createdAt: string;
  fingerprint: string;
}

const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const file = (root: string) => resolveInside(root, "sessions/dialogue-red-blue-cases.jsonl");

export function createDialogueRedBlueCase(question: DialogueQuestion): DialogueRedBlueCase {
  const labels = question.options.map((option) => option.trim()).filter(Boolean);
  if (labels.length < 2 || labels.length > 3) throw new Error("RED_BLUE_OPTIONS_INVALID");
  const base = {
    schemaVersion: "dialogue-red-blue-case.v1" as const,
    caseId: `red-blue-${question.questionId}-${question.questionVersion}`,
    projectSlug: question.projectSlug,
    questionId: question.questionId,
    questionVersion: question.questionVersion,
    questionFingerprint: question.snapshotFingerprint,
    options: labels.map((label, index) => ({
      optionId: `${question.questionId}-option-${index + 1}`,
      label,
      claim: `${label} is the strongest viable answer to: ${question.text}`,
      bestCase: `Choosing ${label} preserves the intended direction while keeping the next step explicit.`,
      premises: [question.text, question.whyNow],
      evidenceRefs: [`dialogue-question://${question.questionId}`],
      failureModes: [`The choice may conflict with a later author correction or newly discovered evidence.`],
      opportunityCost: `Other answers to ${question.questionId} remain unexplored until this choice is superseded.`,
      reversibility: question.reversibility,
      affectedDecisions: [question.questionId],
      uncertainty: question.ambiguity >= 0.7 ? "high" : question.ambiguity >= 0.4 ? "medium" : "low"
    })),
    sharedFacts: [question.text, question.whyNow],
    irreducibleTradeoff: `Choosing one answer prioritizes its direction over the alternatives for ${question.questionId}.`,
    recommendation: question.recommendation,
    recommendationReason: "The recommendation is the current author-facing default; it is not an adoption event.",
    dissent: labels.filter((label) => label !== question.recommendation).map((label) => `${label} remains viable but carries a different tradeoff.`),
    whatWouldChangeRecommendation: ["A corrected author answer", "A stale snapshot fingerprint", "New evidence that changes the stated error cost"],
    status: "open" as const,
    createdAt: new Date().toISOString()
  };
  return { ...base, fingerprint: hash(base) };
}

export function assertDialogueRedBlueCaseIntegrity(value: DialogueRedBlueCase, expectedCaseId?: string): DialogueRedBlueCase {
  const { fingerprint, ...base } = value;
  const valid = value?.schemaVersion === "dialogue-red-blue-case.v1" && (!expectedCaseId || value.caseId === expectedCaseId) && value.projectSlug.trim() && value.questionId.trim() && Number.isInteger(value.questionVersion) && value.questionVersion > 0 && value.questionFingerprint.trim() && value.options.length >= 2 && value.options.length <= 3 && value.options.every((option) => option.optionId && option.label && option.claim && option.bestCase && option.premises.length && option.evidenceRefs.length && option.failureModes.length && option.opportunityCost && option.reversibility && option.affectedDecisions.length && option.uncertainty) && value.sharedFacts.length && value.irreducibleTradeoff && value.recommendation && value.recommendationReason && value.whatWouldChangeRecommendation.length && ["open", "superseded"].includes(value.status) && !Number.isNaN(Date.parse(value.createdAt)) && /^[a-f0-9]{64}$/i.test(fingerprint) && hash(base) === fingerprint;
  if (!valid) throw new Error("DIALOGUE_RED_BLUE_CASE_INTEGRITY_FAILED");
  return value;
}

export async function persistDialogueRedBlueCase(root: string, value: DialogueRedBlueCase): Promise<{ created: boolean; redBlueCase: DialogueRedBlueCase }> {
  assertDialogueRedBlueCaseIntegrity(value);
  const existing = await readDialogueRedBlueCase(root, value.caseId);
  if (existing) return { created: false, redBlueCase: existing };
  const target = file(root);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.appendFile(target, `${JSON.stringify(value)}\n`, "utf8");
  return { created: true, redBlueCase: value };
}

export async function readDialogueRedBlueCase(root: string, caseId: string): Promise<DialogueRedBlueCase | null> {
  try {
    const content = await fs.readFile(file(root), "utf8");
    const rows = content.split(/\r?\n/).filter(Boolean).map((line) => assertDialogueRedBlueCaseIntegrity(JSON.parse(line) as DialogueRedBlueCase));
    return rows.find((row) => row.caseId === caseId) || null;
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null;
    throw error;
  }
}
