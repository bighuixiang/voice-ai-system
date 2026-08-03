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
import { appendAuthorMessage } from "./creativeSession.js";
import { freezeContextManifest } from "./contextManifest.js";

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

  it("does not create a second active blocking question with a different id", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dialogue-question-single-active-"));
    roots.push(root);
    const first = await createDialogueQuestion(root, {
      projectSlug: "demo",
      questionId: "question-pov",
      questionVersion: 1,
      text: "Which point of view should lead the opening?",
      whyNow: "POV changes the contract and context boundary.",
      impact: "high",
      ambiguity: 0.9,
      errorCost: "high",
      reversibility: "low",
      delayCost: "medium",
      options: ["First person", "Close third person"],
      recommendation: "Close third person",
      snapshotFingerprint: "f".repeat(64)
    });
    const second = await createDialogueQuestion(root, {
      projectSlug: "demo",
      questionId: "question-ending",
      questionVersion: 1,
      text: "Should the ending remain open?",
      whyNow: "The ending is a separate high-impact decision.",
      impact: "high",
      ambiguity: 0.8,
      errorCost: "high",
      reversibility: "low",
      delayCost: "medium",
      options: ["Open", "Closed"],
      recommendation: "Open",
      snapshotFingerprint: "f".repeat(64)
    });

    expect(second).toEqual({ created: false, question: first.question });
    await expect(readDialogueQuestions(root)).resolves.toEqual([expect.objectContaining({ questionId: "question-pov", status: "active" })]);
  });

  it("keeps a low-risk candidate reviewable without consuming the active blocking slot", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dialogue-question-candidate-"));
    roots.push(root);
    const active = await createDialogueQuestion(root, {
      projectSlug: "demo",
      questionId: "question-core-conflict",
      questionVersion: 1,
      text: "What pressure opposes the protagonist?",
      whyNow: "It changes the opening contract.",
      impact: "high",
      ambiguity: 0.8,
      errorCost: "high",
      reversibility: "low",
      delayCost: "medium",
      options: ["A", "B"],
      recommendation: "A",
      snapshotFingerprint: "1".repeat(64)
    });
    const candidate = await createDialogueQuestion(root, {
      projectSlug: "demo",
      questionId: "question-temporary-location",
      questionVersion: 1,
      status: "candidate",
      text: "Which temporary street name sounds right?",
      whyNow: "This detail can be changed later.",
      impact: "low",
      ambiguity: 0.2,
      errorCost: "low",
      reversibility: "high",
      delayCost: "low",
      options: ["North Street", "Harbor Lane"],
      recommendation: "Harbor Lane",
      snapshotFingerprint: "1".repeat(64)
    });

    expect(active.question.status).toBe("active");
    expect(candidate).toMatchObject({ created: true, question: { status: "candidate", questionId: "question-temporary-location" } });
    await expect(readDialogueQuestions(root)).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ questionId: "question-core-conflict", status: "active" }),
      expect.objectContaining({ questionId: "question-temporary-location", status: "candidate" })
    ]));
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
      answerStatus: "confirmed",
      redBlueCaseId: "red-blue-question-primary-desire-3"
    });
    const replay = await answerDialogueQuestion(root, {
      questionId: "question-primary-desire",
      questionVersion: 3,
      expectedSnapshotFingerprint: "b".repeat(64),
      idempotencyKey: "answer-001",
      answerText: "A",
      answerStatus: "confirmed"
    });
    expect(answer).toMatchObject({ accepted: true, question: { status: "answered" }, decision: { status: "recorded", canonWritten: false, redBlueCaseId: "red-blue-question-primary-desire-3", answerPayload: { schemaVersion: "dialogue-answer-payload.v1", questionId: "question-primary-desire", questionVersion: 3, answerStatus: "confirmed", sourceFingerprint: "b".repeat(64), fingerprint: expect.any(String) } } });
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

  it("allows only one concurrent answer to advance a question", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dialogue-question-concurrent-"));
    roots.push(root);
    await createDialogueQuestion(root, { projectSlug: "demo", questionId: "q-concurrent", questionVersion: 1, text: "Choose A or B.", whyNow: "Blocks outline.", impact: "high", ambiguity: 0.4, errorCost: "high", reversibility: "low", delayCost: "low", options: ["A", "B"], recommendation: "A", snapshotFingerprint: "d".repeat(64) });
    const results = await Promise.all(["mobile", "desktop"].map((device) => answerDialogueQuestion(root, { questionId: "q-concurrent", questionVersion: 1, expectedSnapshotFingerprint: "d".repeat(64), idempotencyKey: `answer-${device}`, answerText: device === "mobile" ? "A" : "B", answerStatus: "confirmed" })));
    expect(results.filter((result) => result.accepted)).toHaveLength(1);
    expect(results.filter((result) => !result.accepted)[0]).toMatchObject({ conflict: { code: "QUESTION_NOT_ACTIVE" } });
    expect((await readDialogueQuestions(root)).filter((question) => question.questionId === "q-concurrent")).toHaveLength(1);
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

  it("rejects an answer when the frozen understanding input is stale", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dialogue-question-stale-input-"));
    roots.push(root);
    await appendAuthorMessage({ root, projectSlug: "demo", clientMessageId: "author-1", text: "A keeper hears a bell beneath the tide." });
    const frozen = await freezeContextManifest(root, "demo");
    await createDialogueQuestion(root, {
      projectSlug: "demo",
      questionId: "question-primary-desire",
      questionVersion: 1,
      text: "What does the keeper want most?",
      whyNow: "It changes the opening contract.",
      impact: "high",
      ambiguity: 0.8,
      errorCost: "high",
      reversibility: "low",
      delayCost: "medium",
      options: [],
      recommendation: "Ask",
      snapshotFingerprint: frozen.manifest.sourceFingerprint
    });
    await appendAuthorMessage({ root, projectSlug: "demo", clientMessageId: "author-2", text: "The keeper finds a map in the bell tower." });

    const result = await answerDialogueQuestion(root, {
      questionId: "question-primary-desire",
      questionVersion: 1,
      expectedSnapshotFingerprint: frozen.manifest.sourceFingerprint,
      idempotencyKey: "stale-input-answer",
      answerText: "Prove the city survived.",
      answerStatus: "confirmed"
    });

    expect(result).toMatchObject({ accepted: false, conflict: { code: "SNAPSHOT_FINGERPRINT_STALE" } });
    await expect(readDialogueQuestions(root)).resolves.toEqual([expect.objectContaining({ status: "active" })]);
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

  it("rejects an answer without an idempotency key or content", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dialogue-question-"));
    roots.push(root);
    await createDialogueQuestion(root, { projectSlug: "demo", questionId: "q-required", questionVersion: 1, text: "Choose", whyNow: "Now", impact: "high", ambiguity: 0.5, errorCost: "high", reversibility: "low", delayCost: "low", options: ["A", "B"], recommendation: "A", snapshotFingerprint: "e".repeat(64) });
    await expect(answerDialogueQuestion(root, { questionId: "q-required", questionVersion: 1, expectedSnapshotFingerprint: "e".repeat(64), idempotencyKey: "", answerText: "A", answerStatus: "confirmed" })).rejects.toThrow("QUESTION_ANSWER_FIELDS_REQUIRED");
    await expect(answerDialogueQuestion(root, { questionId: "q-required", questionVersion: 1, expectedSnapshotFingerprint: "e".repeat(64), idempotencyKey: "answer-empty", answerText: "", answerStatus: "confirmed" })).rejects.toThrow("QUESTION_ANSWER_FIELDS_REQUIRED");
  });

  it("fails closed when a signed question event is tampered", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dialogue-question-"));
    roots.push(root);
    await createDialogueQuestion(root, { projectSlug: "demo", questionId: "q-integrity", questionVersion: 1, text: "Choose", whyNow: "Now", impact: "high", ambiguity: 0.5, errorCost: "high", reversibility: "low", delayCost: "low", options: ["A", "B"], recommendation: "A", snapshotFingerprint: "f".repeat(64) });
    const eventPath = path.join(root, "sessions", "dialogue-question-events.jsonl");
    const event = JSON.parse(await fs.readFile(eventPath, "utf8")) as Record<string, unknown>;
    event.question = { ...(event.question as Record<string, unknown>), text: "tampered" };
    await fs.writeFile(eventPath, JSON.stringify(event) + "\n", "utf8");
    await expect(readDialogueQuestions(root)).rejects.toThrow("DIALOGUE_QUESTION_EVENT_INTEGRITY_FAILED");
  });
});
