import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { resolveInside } from "./pathSafety.js";
import { fingerprintCreativeSession } from "./contextManifest.js";
import { readCreativeSession } from "./creativeSession.js";
import { createDecisionImpactReport, persistDecisionImpactReport, readDecisionConsumptionRefs } from "./decisionImpact.js";

export type DialogueQuestionStatus = "candidate" | "active" | "answered" | "delegated" | "deferred" | "withdrawn" | "superseded";
export type DialogueAnswerStatus = "confirmed" | "tentative" | "delegated";

export interface DialogueAnswerPayload {
  schemaVersion: "dialogue-answer-payload.v1";
  answerId: string;
  questionId: string;
  questionVersion: number;
  answerText: string;
  answerStatus: DialogueAnswerStatus;
  sourceFingerprint: string;
  evidenceRefs: string[];
  submittedAt: string;
  fingerprint: string;
}

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
  answerPayload: DialogueAnswerPayload;
  canonWritten: false;
  redBlueCaseId?: string;
  supersedesDecisionId?: string;
  impactReportId?: string;
  correction?: { relation: "supersedes" | "retracts" | "refines"; previousText?: string; replacementText?: string };
  createdAt: string;
  fingerprint?: string;
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
  fingerprint?: string;
}

const hash = (value: unknown): string => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

function signDecision(decision: DecisionRecord): DecisionRecord {
  const { fingerprint: _fingerprint, ...base } = decision;
  return { ...base, fingerprint: hash(base) };
}

function assertDecisionIntegrity(decision: DecisionRecord): DecisionRecord {
  if (decision.fingerprint === undefined) return decision;
  const { fingerprint: _fingerprint, ...base } = decision;
  if (!/^[a-f0-9]{64}$/i.test(decision.fingerprint) || hash(base) !== decision.fingerprint) throw new Error("DIALOGUE_DECISION_INTEGRITY_FAILED");
  return decision;
}

function signEvent(event: DialogueQuestionEvent): DialogueQuestionEvent {
  const { fingerprint: _fingerprint, ...base } = event;
  return { ...base, fingerprint: hash(base) };
}

function assertEventIntegrity(event: DialogueQuestionEvent): DialogueQuestionEvent {
  if (event.fingerprint === undefined) return event;
  const { fingerprint: _fingerprint, ...base } = event;
  if (!/^[a-f0-9]{64}$/i.test(event.fingerprint) || hash(base) !== event.fingerprint) throw new Error("DIALOGUE_QUESTION_EVENT_INTEGRITY_FAILED");
  if (event.decision) assertDecisionIntegrity(event.decision);
  return event;
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
        const event = assertEventIntegrity(JSON.parse(line) as DialogueQuestionEvent);
        if (!event?.questionId || !event?.question) throw new Error("DIALOGUE_QUESTION_EVENT_INTEGRITY_FAILED");
        return [event];
      } catch {
        throw new Error("DIALOGUE_QUESTION_EVENT_INTEGRITY_FAILED");
      }
    });
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return [];
    throw error;
  }
}

async function appendEvent(root: string, event: DialogueQuestionEvent): Promise<void> {
  const signed = signEvent(event.decision ? { ...event, decision: signDecision(event.decision) } : event);
  const target = eventPath(root);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.appendFile(target, `${JSON.stringify(signed)}\n`, "utf8");
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
        const record = assertDecisionIntegrity(JSON.parse(line) as DecisionRecord);
        if (!record?.decisionId) throw new Error("DIALOGUE_DECISION_INTEGRITY_FAILED");
        return [record];
      } catch {
        throw new Error("DIALOGUE_DECISION_INTEGRITY_FAILED");
      }
    });
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return [];
    throw error;
  }
}

export async function createDialogueQuestion(
  root: string,
  input: Omit<DialogueQuestion, "schemaVersion" | "status" | "projectSlug"> & { projectSlug: string; status?: Extract<DialogueQuestionStatus, "active" | "candidate"> }
): Promise<{ created: boolean; question: DialogueQuestion }> {
  return withLock(root, async () => {
    const currentQuestions = await readDialogueQuestions(root);
    const activeQuestions = currentQuestions.filter((question) => question.status === "active");
    const requestedStatus = input.status || "active";
    const existing = currentQuestions.find((question) => question.questionId === input.questionId && (question.status === "active" || question.status === "candidate"));
    if (existing) return { created: false, question: existing };
    // A blocking question is a single-user decision surface. Returning the
    // current active question keeps competing callers idempotent and prevents
    // two high-impact decisions from being presented at once.
    if (requestedStatus === "active" && activeQuestions[0]) return { created: false, question: activeQuestions[0] };
    const question: DialogueQuestion = {
      schemaVersion: "dialogue-question.v1",
      ...input,
      status: requestedStatus
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
    redBlueCaseId?: string;
  }
): Promise<
  | { accepted: true; replayed?: boolean; question: DialogueQuestion; decision?: DecisionRecord }
  | { accepted: false; conflict: { code: "QUESTION_NOT_FOUND" | "QUESTION_VERSION_STALE" | "QUESTION_NOT_ACTIVE" | "SNAPSHOT_FINGERPRINT_STALE"; current?: DialogueQuestion } }
> {
  if (!input.questionId.trim() || !input.idempotencyKey.trim() || !input.answerText.trim() || !input.expectedSnapshotFingerprint.trim()) throw new Error("QUESTION_ANSWER_FIELDS_REQUIRED");
  return withLock(root, async () => {
    const events = await readEvents(root);
    const replay = events.find((event) => event.type === "question.answered" && event.idempotencyKey === input.idempotencyKey);
    if (replay) return { accepted: true, replayed: true, question: replay.question, decision: replay.decision };
    const current = project(events).find((question) => question.questionId === input.questionId);
    if (!current) return { accepted: false, conflict: { code: "QUESTION_NOT_FOUND" } };
    if (current.questionVersion !== input.questionVersion) return { accepted: false, conflict: { code: "QUESTION_VERSION_STALE", current } };
    if (current.snapshotFingerprint !== input.expectedSnapshotFingerprint) return { accepted: false, conflict: { code: "SNAPSHOT_FINGERPRINT_STALE", current } };
    const manifestPath = resolveInside(root, "sessions/context-manifest.json");
    try {
      await fs.access(manifestPath);
      const session = await readCreativeSession(root, current.projectSlug);
      if (fingerprintCreativeSession(session) !== current.snapshotFingerprint) {
        return { accepted: false, conflict: { code: "SNAPSHOT_FINGERPRINT_STALE", current } };
      }
    } catch (error) {
      if (!(error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT")) throw error;
    }
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
    let decision: DecisionRecord = {
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
      answerPayload: (() => {
        const payloadBase = {
          schemaVersion: "dialogue-answer-payload.v1" as const,
          answerId: `answer-${input.questionId}-${input.questionVersion}-${input.idempotencyKey}`,
          questionId: input.questionId,
          questionVersion: input.questionVersion,
          answerText: input.answerText,
          answerStatus: input.answerStatus,
          sourceFingerprint: current.snapshotFingerprint,
          evidenceRefs: [input.questionId],
          submittedAt: new Date().toISOString()
        };
        return { ...payloadBase, fingerprint: hash(payloadBase) };
      })(),
      canonWritten: false,
      ...(input.redBlueCaseId?.trim() ? { redBlueCaseId: input.redBlueCaseId } : {}),
      ...(previousDecision ? { supersedesDecisionId: previousDecision.decisionId } : {}),
      ...((normalizedCorrection ?? correctionMatch) ? { correction: { relation: "supersedes" as const, previousText: (normalizedCorrection ?? correctionMatch)![1], replacementText: (normalizedCorrection ?? correctionMatch)![2] } } : {}),
      createdAt: new Date().toISOString()
    };
    if (previousDecision) {
      const impact = createDecisionImpactReport({ decision, supersededDecisionId: previousDecision.decisionId, affectedConsumers: await readDecisionConsumptionRefs(root, previousDecision.decisionId) });
      decision = { ...decision, impactReportId: impact.reportId };
      await persistDecisionImpactReport(root, impact);
    }
    const signedDecision = signDecision(decision);
    const event: DialogueQuestionEvent = {
      schemaVersion: "dialogue-question-event.v1",
      eventId: eventId(),
      type: "question.answered",
      questionId: input.questionId,
      idempotencyKey: input.idempotencyKey,
      question,
      answerText: input.answerText,
      answerStatus: input.answerStatus,
      decision: signedDecision,
      createdAt: new Date().toISOString()
    };
    await appendEvent(root, event);
    const decisionTarget = decisionPath(root);
    await fs.mkdir(path.dirname(decisionTarget), { recursive: true });
    await fs.appendFile(decisionTarget, `${JSON.stringify(signedDecision)}\n`, "utf8");
    return { accepted: true, question, decision: signedDecision };
  });
}
