import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDialogueUtterance } from "./dialogueUnderstanding.js";
import { appendDialogueUtterance, readDialogueUtterances } from "./dialogueUtteranceStore.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))); });

describe("dialogue utterance persistence", () => {
  it("persists immutable source and replays the same idempotency key", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "utterance-store-")); roots.push(root);
    const utterance = createDialogueUtterance({ projectId: "demo", sessionId: "s-1", turn: 1, authorId: "author", text: "Keep the door mysterious.", clientTimestamp: "2026-07-31T00:00:00Z", language: "en", attachmentRefs: [], idempotencyKey: "u-1" });
    expect(await appendDialogueUtterance(root, utterance)).toMatchObject({ created: true, utterance: { text: utterance.text } });
    expect(await appendDialogueUtterance(root, utterance)).toMatchObject({ created: false, replayed: true, utterance: { text: utterance.text } });
    expect(await readDialogueUtterances(root)).toEqual([utterance]);
  });

  it("rejects idempotency reuse with changed source text and tampered records", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "utterance-store-")); roots.push(root);
    const utterance = createDialogueUtterance({ projectId: "demo", sessionId: "s-1", turn: 1, authorId: "author", text: "Keep it quiet.", clientTimestamp: "2026-07-31T00:00:00Z", language: "en", attachmentRefs: [], idempotencyKey: "u-2" });
    await appendDialogueUtterance(root, utterance);
    await expect(appendDialogueUtterance(root, { ...utterance, text: "Change it" })).rejects.toThrow("DIALOGUE_UTTERANCE_IDEMPOTENCY_CONFLICT");
    await fs.writeFile(path.join(root, "sessions", "dialogue-utterances.jsonl"), JSON.stringify({ ...utterance, text: "tampered" }) + "\n", "utf8");
    await expect(readDialogueUtterances(root)).rejects.toThrow("DIALOGUE_UTTERANCE_INTEGRITY_FAILED");
  });
});
