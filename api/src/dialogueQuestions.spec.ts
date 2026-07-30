import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  answerDialogueQuestion,
  createDialogueQuestion,
  readDialogueQuestions,
  type DialogueQuestion
} from "./dialogueQuestions.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe("dialogue question lifecycle", () => {
  it("activates exactly one high-value question and preserves candidate history", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dialogue-question-"));
    roots.push(root);
    const first = await createDialogueQuestion(root, {
      projectSlug: "demo",
      questionId: "question-primary-desire",
      questionVersion: 1,
      text: "What must the protagonist want most in the opening movement?",
      whyNow: "This choice changes the first contract candidate.",
      impact: "high",
      ambiguity: 0.8,
      errorCost: "high",
      reversibility: "low",
      delayCost: "medium",
      options: ["Protect someone", "Expose the truth"],
      recommendation: "Expose the truth",
      snapshotFingerprint: "a".repeat(64)
    });
    const duplicate = await createDialogueQuestion(root, { ...first.question, questionVersion: 2 });

    expect(first.question).toMatchObject({ status: "active", questionVersion: 1 });
    expect(duplicate.question).toMatchObject({ questionId: first.question.questionId, status: "active", questionVersion: 1 });
    const projection = await readDialogueQuestions(root);
    expect(projection).toHaveLength(1);
    expect(projection[0]).toMatchObject({ status: "active", questionId: "question-primary-desire" });
  });

  it("answers idempotently and rejects stale question versions without mutating state", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dialogue-question-"));
    roots.push(root);
    await createDialogueQuestion(root, {
      projectSlug: "demo",
      questionId: "question-primary-desire",
      questionVersion: 3,
      text: "What does the protagonist want?",
      whyNow: "It changes the opening.",
      impact: "high",
      ambiguity: 0.7,
      errorCost: "high",
      reversibility: "low",
      delayCost: "low",
      options: ["A", "B"],
      recommendation: "A",
      snapshotFingerprint: "b".repeat(64)
    });

    const answer = await answerDialogueQuestion(root, {
      questionId: "question-primary-desire",
      questionVersion: 3,
      expectedSnapshotFingerprint: "b".repeat(64),
      idempotencyKey: "answer-001",
      answerText: "A",
      answerStatus: "confirmed"
    });
    const replay = await answerDialogueQuestion(root, {
      questionId: "question-primary-desire",
      questionVersion: 3,
      expectedSnapshotFingerprint: "b".repeat(64),
      idempotencyKey: "answer-001",
      answerText: "A",
      answerStatus: "confirmed"
    });
    expect(answer).toMatchObject({ accepted: true, question: { status: "answered" }, decision: { status: "recorded", canonWritten: false } });
    expect(replay).toMatchObject({ accepted: true, replayed: true, question: answer.question, decision: answer.decision });

    const stale = await answerDialogueQuestion(root, {
      questionId: "question-primary-desire",
      questionVersion: 2,
      expectedSnapshotFingerprint: "b".repeat(64),
      idempotencyKey: "answer-stale",
      answerText: "B",
      answerStatus: "confirmed"
    });
    expect(stale).toMatchObject({ accepted: false, conflict: { code: "QUESTION_VERSION_STALE" } });
    const projection = await readDialogueQuestions(root);
    expect(projection[0]).toMatchObject({ status: "answered", questionVersion: 3 });
  });

  it("keeps tentative answers non-final", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dialogue-question-"));
    roots.push(root);
    await createDialogueQuestion(root, {
      projectSlug: "demo",
      questionId: "question-primary-desire",
      questionVersion: 1,
      text: "Choose a desire.",
      whyNow: "Opening contract.",
      impact: "high",
      ambiguity: 0.5,
      errorCost: "high",
      reversibility: "low",
      delayCost: "low",
      options: ["A", "B"],
      recommendation: "A",
      snapshotFingerprint: "c".repeat(64)
    });
    const result = await answerDialogueQuestion(root, {
      questionId: "question-primary-desire",
      questionVersion: 1,
      expectedSnapshotFingerprint: "c".repeat(64),
      idempotencyKey: "answer-tentative",
      answerText: "Maybe A",
      answerStatus: "tentative"
    });
    expect(result.question.status).toBe("deferred");
    expect(result.question.answerStatus).toBe("tentative");
    expect(result.decision).toMatchObject({ status: "provisional", canonWritten: false });
  });

  it("records a correction as a superseding decision instead of overwriting history", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dialogue-question-"));
    roots.push(root);
    await createDialogueQuestion(root, {
      projectSlug: "demo",
      questionId: "question-primary-desire",
      questionVersion: 1,
      text: "What does the protagonist want?",
      whyNow: "Opening contract.",
      impact: "high",
      ambiguity: 0.5,
      errorCost: "high",
      reversibility: "low",
      delayCost: "low",
      options: [],
      recommendation: "Ask",
      snapshotFingerprint: "d".repeat(64)
    });
    const result = await answerDialogueQuestion(root, {
      questionId: "question-primary-desire",
      questionVersion: 1,
      expectedSnapshotFingerprint: "d".repeat(64),
      idempotencyKey: "answer-correction",
      answerText: "不是复仇，是保护妹妹",
      answerStatus: "confirmed"
    });
    expect(result.decision).toMatchObject({ correction: { relation: "supersedes", previousText: "复仇", replacementText: "保护妹妹" } });
  });
});
