import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { atomizeIntent } from "./dialogueUnderstanding.js";
import { appendDialogueIntentAtoms, readDialogueIntentAtoms } from "./dialogueIntentStore.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))); });

const atoms = () => atomizeIntent({ utteranceId: "utterance-1", text: "保留门的神秘；继续第一章。", atoms: [
  { atomId: "a-1", kind: "constraint", text: "保留门的神秘", start: 0, end: 7, targetAsset: "world-rule", scope: "project", relation: "preserve" },
  { atomId: "a-2", kind: "command", text: "继续第一章", start: 8, end: 13, targetAsset: "chapter-1", scope: "chapter", relation: "follow-up" }
] });

describe("dialogue intent atom persistence", () => {
  it("stores every atom with source utterance and replays atomically", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "intent-store-")); roots.push(root);
    const first = await appendDialogueIntentAtoms(root, atoms());
    expect(first).toMatchObject({ created: true, atoms: [{ atomId: "a-1", sourceUtteranceId: "utterance-1" }, { atomId: "a-2" }] });
    expect(await appendDialogueIntentAtoms(root, atoms())).toMatchObject({ created: false, replayed: true });
    expect(await readDialogueIntentAtoms(root)).toHaveLength(2);
  });

  it("fails closed on a changed atom or tampered fingerprint", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "intent-store-")); roots.push(root);
    const original = atoms(); await appendDialogueIntentAtoms(root, original);
    await expect(appendDialogueIntentAtoms(root, [{ ...original[0], text: "改变" }, original[1]])).rejects.toThrow("DIALOGUE_INTENT_IDEMPOTENCY_CONFLICT");
    await fs.writeFile(path.join(root, "sessions", "dialogue-intents.jsonl"), JSON.stringify({ ...original[0], text: "tampered" }) + "\n", "utf8");
    await expect(readDialogueIntentAtoms(root)).rejects.toThrow("DIALOGUE_INTENT_INTEGRITY_FAILED");
  });
});
