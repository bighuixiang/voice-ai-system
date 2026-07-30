import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import { readDecisionRecords, type DecisionRecord } from "./dialogueQuestions.js";
import { readUnderstandingSnapshot } from "./understandingExecutor.js";

export interface ContractField {
  fieldId: string;
  path: "protagonist.primaryDesire" | "protagonist.innerNeed" | "protagonist.misbelief" | "world.rules.primary" | "conflict.core" | "conflict.opposingPressure" | "stakes.failureCost" | "stakes.irreversibleChoice" | "readerPromise" | "endingDirection";
  value: string;
  epistemicStatus: "explicit" | "provisional";
  evidenceRefs: Array<{ kind: "dialogue-question"; refId: string }>;
  sourceDecisionId: string;
  lock: "unlocked";
}

export interface ContractCandidateVariant {
  interpretationId: string;
  label: string;
  summary: string;
  differences: string[];
}

export interface ContractRecompileTrace {
  mode: "initial" | "incremental";
  affectedPaths: ContractField["path"][];
  preservedPaths: ContractField["path"][];
  preservedFingerprints: Partial<Record<ContractField["path"], string>>;
}

export interface StoryContractCandidate {
  schemaVersion: "story-contract-candidate.v1";
  candidateId: string;
  projectSlug: string;
  status: "candidate" | "stale";
  sourceDecisionId: string;
  sourceFingerprint: string;
  variant?: ContractCandidateVariant;
  recompile?: ContractRecompileTrace;
  fields: ContractField[];
  contract: {
    protagonist: { primaryDesire: string | null; innerNeed: string | null; misbelief: string | null };
    conflict: { core: string | null; opposingPressure: string | null };
    stakes: { failureCost: string | null; irreversibleChoice: string | null };
    world: { primaryRule: string | null };
    readerPromise: string | null;
    endingDirection: string | null;
  };
  assumptions: string[];
  impactSummary: string[];
  unknowns: string[];
  supersedesCandidateId?: string;
  canonWritten: false;
  createdAt: string;
  fingerprint: string;
}

function candidatePath(root: string, candidateId: string): string {
  return resolveInside(root, `sessions/contract-candidates/${candidateId}.json`);
}

async function writeJson(root: string, candidateId: string, candidate: StoryContractCandidate): Promise<void> {
  const target = candidatePath(root, candidateId);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(candidate, null, 2)}\n`, "utf8");
  await fs.rename(temporary, target);
}

export async function readContractCandidate(root: string, candidateId: string): Promise<StoryContractCandidate | null> {
  try {
    return JSON.parse(await fs.readFile(candidatePath(root, candidateId), "utf8")) as StoryContractCandidate;
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null;
    throw error;
  }
}

async function listCandidates(root: string): Promise<StoryContractCandidate[]> {
  const directory = resolveInside(root, "sessions/contract-candidates");
  let names: string[];
  try {
    names = await fs.readdir(directory);
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return [];
    throw error;
  }
  const candidates: StoryContractCandidate[] = [];
  for (const name of names.filter((entry) => entry.endsWith(".json"))) {
    const candidate = await readContractCandidate(root, name.slice(0, -5));
    if (candidate) candidates.push(candidate);
  }
  return candidates;
}

export async function listContractCandidates(root: string): Promise<StoryContractCandidate[]> {
  const candidates = await listCandidates(root);
  return candidates.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function fingerprint(candidate: Omit<StoryContractCandidate, "fingerprint">): string {
  return crypto.createHash("sha256").update(JSON.stringify(candidate)).digest("hex");
}

function fieldFingerprint(field: ContractField): string {
  return crypto.createHash("sha256").update(JSON.stringify({
    path: field.path,
    value: field.value,
    evidenceRefs: field.evidenceRefs,
    sourceDecisionId: field.sourceDecisionId
  })).digest("hex");
}

function fieldPathForQuestion(questionId: string): ContractField["path"] | undefined {
  const paths: Record<string, ContractField["path"]> = {
    "question-primary-desire": "protagonist.primaryDesire",
    "question-inner-need": "protagonist.innerNeed",
    "question-misbelief": "protagonist.misbelief",
    "question-world-rule": "world.rules.primary",
    "question-core-conflict": "conflict.core",
    "question-opposing-pressure": "conflict.opposingPressure",
    "question-failure-cost": "stakes.failureCost",
    "question-irreversible-choice": "stakes.irreversibleChoice",
    "question-reader-promise": "readerPromise",
    "question-ending-direction": "endingDirection"
  };
  return paths[questionId];
}

export async function compileContractCandidate(root: string, decisionId: string, interpretationId?: string): Promise<{ candidate: StoryContractCandidate; created: boolean }> {
  const decisions = await readDecisionRecords(root);
  const decision = decisions.find((record) => record.decisionId === decisionId);
  if (!decision) throw new Error("DECISION_NOT_FOUND");
  const snapshot = interpretationId ? await readUnderstandingSnapshot(root) : null;
  const interpretation = interpretationId
    ? snapshot?.interpretationSet?.interpretations.find((item) => item.id === interpretationId)
    : undefined;
  if (interpretationId && !interpretation) throw new Error("INTERPRETATION_NOT_FOUND");
  const candidateId = `contract-candidate-${decision.decisionId}${interpretation ? `-${interpretation.id.replace(/[^a-zA-Z0-9_-]+/g, "-")}` : ""}`;
  const existing = await readContractCandidate(root, candidateId);
  if (existing) return { candidate: existing, created: false };
  const supersededDecision = decision.supersedesDecisionId ? decisions.find((record) => record.decisionId === decision.supersedesDecisionId) : undefined;
  const supersededCandidate = supersededDecision ? (await listCandidates(root)).find((candidate) => candidate.sourceDecisionId === supersededDecision.decisionId) : undefined;
  if (supersededCandidate) {
    await writeJson(root, supersededCandidate.candidateId, { ...supersededCandidate, status: "stale" });
  }
  const latestDecisions = decisions.filter((record) => record.projectSlug === decision.projectSlug && !decisions.some((other) => other.supersedesDecisionId === record.decisionId));
  const fields: ContractField[] = latestDecisions
    .map((record) => {
      const fieldPath = fieldPathForQuestion(record.questionId);
      if (!fieldPath) return null;
      return {
        fieldId: `field-${record.decisionId}-${fieldPath.replaceAll(".", "-")}`,
        path: fieldPath,
        value: record.answerText,
        epistemicStatus: record.answerStatus === "confirmed" ? "explicit" : "provisional",
        evidenceRefs: record.evidenceRefs,
        sourceDecisionId: record.decisionId,
        lock: "unlocked" as const
      };
    })
    .filter((field): field is ContractField => field !== null);
  if (fields.length === 0) throw new Error("NO_CONTRACT_FIELDS");
  const affectedPath = fieldPathForQuestion(decision.questionId);
  const preservedFields = supersededCandidate?.fields.filter((field) => affectedPath !== field.path && fields.some((next) => next.path === field.path && next.value === field.value)) || [];
  const recompile: ContractRecompileTrace = {
    mode: supersededCandidate ? "incremental" : "initial",
    affectedPaths: affectedPath ? [affectedPath] : fields.map((field) => field.path),
    preservedPaths: preservedFields.map((field) => field.path),
    preservedFingerprints: Object.fromEntries(preservedFields.map((field) => [field.path, fieldFingerprint(field)]))
  };
  const base: Omit<StoryContractCandidate, "fingerprint"> = {
    schemaVersion: "story-contract-candidate.v1",
    candidateId,
    projectSlug: decision.projectSlug,
    status: "candidate",
    sourceDecisionId: decision.decisionId,
    sourceFingerprint: decision.sourceFingerprint,
    ...(interpretation ? {
      variant: {
        interpretationId: interpretation.id,
        label: interpretation.label,
        summary: interpretation.summary,
        differences: interpretation.differences
      }
    } : {}),
    recompile,
    fields,
    contract: {
      protagonist: {
        primaryDesire: fields.find((field) => field.path === "protagonist.primaryDesire")?.value || null,
        innerNeed: fields.find((field) => field.path === "protagonist.innerNeed")?.value || null,
        misbelief: fields.find((field) => field.path === "protagonist.misbelief")?.value || null
      },
      conflict: {
        core: fields.find((field) => field.path === "conflict.core")?.value || interpretation?.summary || null,
        opposingPressure: fields.find((field) => field.path === "conflict.opposingPressure")?.value || null
      },
      stakes: {
        failureCost: fields.find((field) => field.path === "stakes.failureCost")?.value || null,
        irreversibleChoice: fields.find((field) => field.path === "stakes.irreversibleChoice")?.value || null
      },
      world: { primaryRule: fields.find((field) => field.path === "world.rules.primary")?.value || null },
      readerPromise: fields.find((field) => field.path === "readerPromise")?.value || null,
      endingDirection: fields.find((field) => field.path === "endingDirection")?.value || null
    },
    assumptions: interpretation?.differences || [],
    impactSummary: interpretation?.downstreamImpacts || [],
    unknowns: [
      ...(fields.some((field) => field.path === "conflict.core") || interpretation ? [] : ["core conflict"]),
      ...(fields.some((field) => field.path === "stakes.failureCost") ? [] : ["failure cost"]),
      ...(fields.some((field) => field.path === "endingDirection") ? [] : ["ending direction"]),
      "near-term consequence",
      ...(fields.some((field) => field.path === "world.rules.primary") ? [] : ["primary world rule"])
    ],
    ...(supersededCandidate ? { supersedesCandidateId: supersededCandidate.candidateId } : {}),
    canonWritten: false,
    createdAt: new Date().toISOString()
  };
  const candidate = { ...base, fingerprint: fingerprint(base) };
  await writeJson(root, candidateId, candidate);
  return { candidate, created: true };
}
