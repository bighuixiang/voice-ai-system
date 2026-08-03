import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import type { IntentAtom } from "./dialogueUnderstanding.js";

const locks = new Map<string, Promise<void>>();
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const canonical = (atom: IntentAtom) => { const { fingerprint: _fingerprint, ...base } = atom; return base; };
const file = (root: string) => resolveInside(root, "sessions/dialogue-intents.jsonl");
const kinds = new Set(["story_fact", "preference", "constraint", "idea", "question", "correction", "command", "delegation", "rejection"]);

export function assertDialogueIntentAtomIntegrity(atom: IntentAtom): IntentAtom {
  const { fingerprint, ...base } = atom;
  const valid = atom?.schemaVersion === "intent-atom.v1" &&
    [atom.atomId, atom.sourceUtteranceId, atom.text, atom.targetAsset, atom.scope, atom.relation].every((value) => typeof value === "string" && value.trim()) &&
    kinds.has(atom.kind) && Number.isInteger(atom.start) && atom.start >= 0 && Number.isInteger(atom.end) && atom.end > atom.start &&
    /^[a-f0-9]{64}$/i.test(fingerprint) && hash(base) === fingerprint;
  if (!valid) throw new Error("DIALOGUE_INTENT_INTEGRITY_FAILED");
  return atom;
}

async function withLock<T>(root: string, operation: () => Promise<T>): Promise<T> {
  const previous = locks.get(root) ?? Promise.resolve(); let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; }); locks.set(root, current); await previous;
  try { return await operation(); } finally { release(); if (locks.get(root) === current) locks.delete(root); }
}

export async function readDialogueIntentAtoms(root: string): Promise<IntentAtom[]> {
  try {
    const content = await fs.readFile(file(root), "utf8");
    return content.split(/\r?\n/).filter(Boolean).map((line) => {
      let atom: IntentAtom;
      try { atom = JSON.parse(line) as IntentAtom; } catch { throw new Error("DIALOGUE_INTENT_INTEGRITY_FAILED"); }
      return assertDialogueIntentAtomIntegrity(atom);
    });
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return [];
    throw error;
  }
}

export async function appendDialogueIntentAtoms(root: string, atoms: readonly IntentAtom[]): Promise<{ created: boolean; replayed?: boolean; atoms: IntentAtom[] }> {
  if (!atoms.length) throw new Error("DIALOGUE_INTENT_ATOMS_REQUIRED");
  const utteranceId = atoms[0].sourceUtteranceId;
  if (!utteranceId || atoms.some((atom) => atom.sourceUtteranceId !== utteranceId)) throw new Error("DIALOGUE_INTENT_SOURCE_MISMATCH");
  return withLock(root, async () => {
    const existing = await readDialogueIntentAtoms(root);
    const prior = existing.filter((atom) => atom.sourceUtteranceId === utteranceId);
    if (prior.length) {
      const byId = new Map(prior.map((atom) => [atom.atomId, atom]));
      if (prior.length !== atoms.length || atoms.some((atom) => JSON.stringify(canonical(byId.get(atom.atomId) ?? atom)) !== JSON.stringify(canonical(atom)))) throw new Error("DIALOGUE_INTENT_IDEMPOTENCY_CONFLICT");
      return { created: false, replayed: true, atoms: prior };
    }
    const target = file(root); await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.appendFile(target, atoms.map((atom) => `${JSON.stringify(atom)}\n`).join(""), "utf8");
    return { created: true, atoms: [...atoms] };
  });
}
