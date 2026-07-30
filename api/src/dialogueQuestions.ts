import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";

export type DialogueQuestionStatus = "candidate" | "active" | "answered" | "delegated" | "deferred" | "withdrawn" | "superseded";
export type DialogueAnswerStatus = "confirmed" | "tentative" | "delegated";

export interface DialogueQuestion {
  schemaVersion: "dialogue-question.v1";
  questionId: string;
  questionVersion: number;
  projectSlug: string;
  status: DialogueQuestionStatus;
  text: string;
  whyNow: string;
  impact: "low" | "medium" | "high";
  ambiguity: number;
  errorCost: string;
  reversibility: string;
  delayCost: string;
  options: string[];
  recommendation: string;
  snapshotFingerprint: string;
  answerStatus?: DialogueAnswerStatus;
  answerText?: string;
  answeredAt?: string;
}

export interface DecisionRecord {
  schemaVersion: "decision-record.v1";
  decisionId: string;
  questionId: string;
  projectSlug: string;
  questionVersion: number;
  answerText: string;
  answerStatus: DialogueAnswerStatus;
  status: "recorded" | "provisional" | "delegated";
  sourceFingerprint: string;
  evidenceRefs: Array<{ kind: "dialogue-question"; refId: string }>;
  canonWritten: false;
  supersedesDecisionId?: string;
  correction?: { relation: "supersedes" | "retracts" | "refines"; previousText?: string; replacementText?: string };
  createdAt: string;
}

interface DialogueQuestionEvent {
  schemaVersion: "dialogue-question-event.v1";
  eventId: string;
  type: "question.created" | "question.answered";
  questionId: string;
  idempotencyKey?: string;
  question: DialogueQuestion;
  answerText?: string;
  answerStatus?: DialogueAnswerStatus;
  createdAt: string;
  decision?: DecisionRecord;
}

const locks = new Map<string, Promise<void>>();

function eventPath(root: string): string {
  return resolveInside(root, "sessions/dialogue-question-events.jsonl");
}

function decisionPath(root: string): string {
  return resolveInside(root, "sessions/decision-records.jsonl");
}

function eventId(): string {
  return `question-event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function withLock<T>(root: string, operation: () => Promise<T>): Promise<T> {
  const previous = locks.get(root) || Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  locks.set(root, current);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (locks.get(root) === current) locks.delete(root);
  }
}

async function readEvents(root: string): Promise<DialogueQuestionEvent[]> {
  try {
    const content = await fs.readFile(eventPath(root), "utf8");
    return content.split(/\r?\n/).filter(Boolean).flatMap((line) => {
      try {
        const event = JSON.parse(line) as DialogueQuestionEvent;
        return event?.questionId && event?.question ? [event] : [];
      } catch {
        return [];
      }
    });
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return [];
    throw error;
  }
}

async function appendEvent(root: string, event: DialogueQuestionEvent): Promise<void> {
  const target = eventPath(root);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.appendFile(target, `${JSON.stringify(event)}\n`, "utf8");
}

function project(events: DialogueQuestionEvent[]): DialogueQuestion[] {
  const byId = new Map<string, DialogueQuestion>();
  for (const event of events) byId.set(event.questionId, event.question);
  return [...byId.values()].sort((left, right) => left.questionId.localeCompare(right.questionId));
}

export async function readDialogueQuestions(root: string): Promise<DialogueQuestion[]> {
  return project(await readEvents(root));
}

export async function readDecisionRecords(root: string): Promise<DecisionRecord[]> {
  try {
    const content = await fs.readFile(decisionPath(root), "utf8");
    return content.split(/\r?\n/).filter(Boolean).flatMap((line) => {
      try {
        const record = JSON.parse(line) as DecisionRecord;
        return record?.decisionId ? [record] : [];
      } catch {
        return [];
      }
    });
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return [];
    throw error;
  }
}

export async function createDialogueQuestion(
  root: string,
  input: Omit<DialogueQuestion, "schemaVersion" | "status" | "projectSlug"> & { projectSlug: string }
): Promise<{ created: boolean; question: DialogueQuestion }> {
  return withLock(root, async () => {
    const existing = (await readDialogueQuestions(root)).find((question) => question.questionId === input.questionId && question.status === "active");
    if (existing) return { created: false, question: existing };
    const question: DialogueQuestion = {
      schemaVersion: "dialogue-question.v1",
      ...input,
      status: "active"
    };
    const event: DialogueQuestionEvent = {
      schemaVersion: "dialogue-question-event.v1",
      eventId: eventId(),
      type: "question.created",
      questionId: question.questionId,
      question,
      createdAt: new Date().toISOString()
    };
    await appendEvent(root, event);
    return { created: true, question };
  });
}

export async function answerDialogueQuestion(
  root: string,
  input: {
    questionId: string;
    questionVersion: number;
    expectedSnapshotFingerprint: string;
    idempotencyKey: string;
    answerText: string;
    answerStatus: DialogueAnswerStatus;
  }
): Promise<
  | { accepted: true; replayed?: boolean; question: DialogueQuestion; decision?: DecisionRecord }
  | { accepted: false; conflict: { code: "QUESTION_NOT_FOUND" | "QUESTION_VERSION_STALE" | "QUESTION_NOT_ACTIVE" | "SNAPSHOT_FINGERPRINT_STALE"; current?: DialogueQuestion } }
> {
  return withLock(root, async () => {
    const events = await readEvents(root);
    const replay = events.find((event) => event.type === "question.answered" && event.idempotencyKey === input.idempotencyKey);
    if (replay) return { accepted: true, replayed: true, question: replay.question, decision: replay.decision };
    const current = project(events).find((question) => question.questionId === input.questionId);
    if (!current) return { accepted: false, conflict: { code: "QUESTION_NOT_FOUND" } };
    if (current.questionVersion !== input.questionVersion) return { accepted: false, conflict: { code: "QUESTION_VERSION_STALE", current } };
    if (current.snapshotFingerprint !== input.expectedSnapshotFingerprint) return { accepted: false, conflict: { code: "SNAPSHOT_FINGERPRINT_STALE", current } };
    if (current.status !== "active") return { accepted: false, conflict: { code: "QUESTION_NOT_ACTIVE", current } };
    const nextStatus: DialogueQuestionStatus = input.answerStatus === "confirmed" ? "answered" : input.answerStatus === "delegated" ? "delegated" : "deferred";
    const question: DialogueQuestion = {
      ...current,
      status: nextStatus,
      answerStatus: input.answerStatus,
      answerText: input.answerText,
      answeredAt: new Date().toISOString()
    };
    const previousDecision = (await readDecisionRecords(root)).find((record) => record.questionId === input.questionId && !record.supersedesDecisionId);
    const correctionMatch = input.answerText.match(/^不是\s*(.+?)[，,。；;]\s*是\s*(.+)$/)
      ?? input.answerText.match(/^\u6d93\u5d06\u69f8\s*(.+?)[，,。；;]\s*(?:\u6d93\u5d06\u69f8)?\s*(.+)$/);
    const normalizedCorrection = input.answerText.match(/^\u4e0d\u662f\s*(.+?)[\uFF0C,\u3002;\uFF1B]\s*\u662F\s*(.+)$/);
    const decision: DecisionRecord = {
      schemaVersion: "decision-record.v1",
      decisionId: `decision-${input.questionId}-${input.questionVersion}-${input.idempotencyKey}`,
      questionId: input.questionId,
      projectSlug: current.projectSlug,
      questionVersion: input.questionVersion,
      answerText: input.answerText,
      answerStatus: input.answerStatus,
      status: input.answerStatus === "confirmed" ? "recorded" : input.answerStatus === "delegated" ? "delegated" : "provisional",
      sourceFingerprint: current.snapshotFingerprint,
      evidenceRefs: [{ kind: "dialogue-question", refId: input.questionId }],
      canonWritten: false,
      ...(previousDecision ? { supersedesDecisionId: previousDecision.decisionId } : {}),
      ...((normalizedCorrection ?? correctionMatch) ? { correction: { relation: "supersedes" as const, previousText: (normalizedCorrection ?? correctionMatch)![1], replacementText: (normalizedCorrection ?? correctionMatch)![2] } } : {}),
      createdAt: new Date().toISOString()
    };
    const event: DialogueQuestionEvent = {
      schemaVersion: "dialogue-question-event.v1",
      eventId: eventId(),
      type: "question.answered",
      questionId: input.questionId,
      idempotencyKey: input.idempotencyKey,
      question,
      answerText: input.answerText,
      answerStatus: input.answerStatus,
      decision,
      createdAt: new Date().toISOString()
    };
    await appendEvent(root, event);
    const decisionTarget = decisionPath(root);
    await fs.mkdir(path.dirname(decisionTarget), { recursive: true });
    await fs.appendFile(decisionTarget, `${JSON.stringify(decision)}\n`, "utf8");
    return { accepted: true, question, decision };
  });
}
