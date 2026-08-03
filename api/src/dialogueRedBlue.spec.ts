import { describe, expect, it } from "vitest";
import { createDialogueRedBlueCase, persistDialogueRedBlueCase, readDialogueRedBlueCase } from "./dialogueRedBlue.js";
import type { DialogueQuestion } from "./dialogueQuestions.js";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const question = (root: string): DialogueQuestion => ({ schemaVersion: "dialogue-question.v1", questionId: "question-desire", questionVersion: 1, projectSlug: "demo", status: "active", text: "What does the protagonist want?", whyNow: "It changes the opening contract.", impact: "high", ambiguity: 0.8, errorCost: "high", reversibility: "low", delayCost: "medium", options: ["Expose the truth", "Protect the family"], recommendation: "Expose the truth", snapshotFingerprint: "f".repeat(64) });

describe("dialogue red-blue case", () => {
  it("builds a bounded evidence contract without adopting an option", () => {
    const value = createDialogueRedBlueCase(question(""));
    expect(value).toMatchObject({ schemaVersion: "dialogue-red-blue-case.v1", status: "open", recommendation: "Expose the truth", options: expect.arrayContaining([expect.objectContaining({ claim: expect.any(String), evidenceRefs: ["dialogue-question://question-desire"] })]) });
    expect(value.options).toHaveLength(2);
  });

  it("persists and replays the same case idempotently", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dialogue-red-blue-"));
    const value = createDialogueRedBlueCase(question(root));
    await expect(persistDialogueRedBlueCase(root, value)).resolves.toMatchObject({ created: true });
    await expect(persistDialogueRedBlueCase(root, value)).resolves.toMatchObject({ created: false, redBlueCase: { fingerprint: value.fingerprint } });
    await expect(readDialogueRedBlueCase(root, value.caseId)).resolves.toMatchObject({ caseId: value.caseId, fingerprint: value.fingerprint });
  });

  it("rejects an unbounded option set", () => {
    expect(() => createDialogueRedBlueCase({ ...question(""), options: ["only"] })).toThrow("RED_BLUE_OPTIONS_INVALID");
  });
});
