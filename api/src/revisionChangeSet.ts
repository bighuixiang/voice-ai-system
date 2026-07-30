import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import { readRevisionIntent } from "./revisionIntent.js";

export type RevisionChangeKind = "add" | "update" | "move" | "split" | "merge" | "supersede" | "transform" | "waive";
export type RevisionTargetKind = "chapter" | "scene" | "text-span" | "obligation" | "fact";

export interface RevisionChangeOperation {
  kind: RevisionChangeKind;
  targetKind: RevisionTargetKind;
  targetId: string;
  chapterId: string;
  rationale: string;
}

export interface RevisionChangeSet {
  schemaVersion: "revision-change-set.v1";
  changeSetId: string;
  intentId: string;
  expectedIntentFingerprint: string;
  status: "candidate";
  operations: RevisionChangeOperation[];
  createdAt: string;
  fingerprint: string;
}

const supportedKinds = new Set<RevisionChangeKind>(["add", "update", "move", "split", "merge", "supersede", "transform", "waive"]);
const supportedTargets = new Set<RevisionTargetKind>(["chapter", "scene", "text-span", "obligation", "fact"]);
function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }

export async function createRevisionChangeSet(root: string, intentId: string, expectedIntentFingerprint: string, operations: RevisionChangeOperation[]): Promise<RevisionChangeSet> {
  const intent = await readRevisionIntent(root, intentId);
  if (!intent || intent.fingerprint !== expectedIntentFingerprint) throw new Error("REVISION_INTENT_STALE");
  if (!operations.length) throw new Error("REVISION_CHANGESET_EMPTY");
  const scope = new Set(intent.scope.chapterIds);
  for (const operation of operations) {
    if (!supportedKinds.has(operation.kind) || !supportedTargets.has(operation.targetKind) || !operation.targetId.trim() || !operation.chapterId.trim() || !operation.rationale.trim()) throw new Error("REVISION_CHANGESET_OPERATION_INVALID");
    if (!scope.has(operation.chapterId)) throw new Error("REVISION_CHANGESET_SCOPE_VIOLATION");
    if (intent.protectedItems.includes(operation.targetId)) throw new Error("REVISION_PROTECTED_ITEM_CONFLICT");
  }
  const base = {
    schemaVersion: "revision-change-set.v1" as const,
    changeSetId: `revision-changeset-${crypto.randomUUID()}`,
    intentId,
    expectedIntentFingerprint,
    status: "candidate" as const,
    operations: operations.map((operation) => ({ ...operation, targetId: operation.targetId.trim(), chapterId: operation.chapterId.trim(), rationale: operation.rationale.trim() })),
    createdAt: new Date().toISOString()
  };
  const changeSet: RevisionChangeSet = { ...base, fingerprint: hash(base) };
  const target = resolveInside(root, `sessions/revisions/changesets/${changeSet.changeSetId}.json`);
  const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(temporary, `${JSON.stringify(changeSet, null, 2)}\n`, "utf8");
  await fs.rename(temporary, target);
  return changeSet;
}
