import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import type { DialogueUtterance } from "./dialogueUnderstanding.js";

const locks = new Map<string, Promise<void>>();
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const canonical = (utterance: DialogueUtterance) => { const { fingerprint: _fingerprint, ...base } = utterance; return base; };
const sourceIdentity = (utterance: DialogueUtterance) => { const { fingerprint: _fingerprint, serverTimestamp: _serverTimestamp, ...base } = utterance; return base; };
const file = (root: string) => resolveInside(root, "sessions/dialogue-utterances.jsonl");

async function withLock<T>(root: string, operation: () => Promise<T>): Promise<T> {
  const previous = locks.get(root) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  locks.set(root, current);
  await previous;
  try { return await operation(); } finally { release(); if (locks.get(root) === current) locks.delete(root); }
}

export async function readDialogueUtterances(root: string): Promise<DialogueUtterance[]> {
  try {
    const content = await fs.readFile(file(root), "utf8");
    return content.split(/\r?\n/).filter(Boolean).map((line) => {
      let value: DialogueUtterance;
      try { value = JSON.parse(line) as DialogueUtterance; } catch { throw new Error("DIALOGUE_UTTERANCE_INTEGRITY_FAILED"); }
      if (!value?.utteranceId || !value.text || !value.idempotencyKey || value.fingerprint !== hash(canonical(value))) throw new Error("DIALOGUE_UTTERANCE_INTEGRITY_FAILED");
      return value;
    });
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return [];
    throw error;
  }
}

export async function appendDialogueUtterance(root: string, utterance: DialogueUtterance): Promise<{ created: boolean; replayed?: boolean; utterance: DialogueUtterance }> {
  return withLock(root, async () => {
    const existing = await readDialogueUtterances(root);
    const match = existing.find((item) => item.projectId === utterance.projectId && item.sessionId === utterance.sessionId && item.idempotencyKey === utterance.idempotencyKey);
    if (match) {
      if (JSON.stringify(sourceIdentity(match)) !== JSON.stringify(sourceIdentity(utterance))) throw new Error("DIALOGUE_UTTERANCE_IDEMPOTENCY_CONFLICT");
      return { created: false, replayed: true, utterance: match };
    }
    const target = file(root);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.appendFile(target, `${JSON.stringify(utterance)}\n`, "utf8");
    return { created: true, utterance };
  });
}
