import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";

export type RevisionIntentType = "fact_correction" | "direction_change" | "retcon" | "reorder" | "entity_rename" | "style_edit" | "quality_repair" | "restore" | "exploration_branch" | "merge" | "reopen_completion";
export type RevisionMaturity = "candidate_generated" | "author_accepted" | "settled" | "publication_ready";
export type RevisionIntentMode = "in_place" | "branch_candidate";

export interface RevisionIntentInput {
  projectSlug: string;
  authorText: string;
  type: RevisionIntentType;
  maturity: RevisionMaturity;
  scope: { chapterIds: string[]; sceneIds?: string[] };
  requestedChanges: string[];
  protectedItems: string[];
  mode: RevisionIntentMode;
  actor: "author" | "system";
}

export interface RevisionIntent extends RevisionIntentInput {
  schemaVersion: "revision-intent.v1";
  intentId: string;
  status: "proposed";
  createdAt: string;
  fingerprint: string;
}

function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function intentPath(root: string, id: string): string { return resolveInside(root, `sessions/revisions/intents/${id}.json`); }

export async function createRevisionIntent(root: string, input: RevisionIntentInput): Promise<RevisionIntent> {
  if (!input.authorText.trim() || !input.requestedChanges.some((item) => item.trim())) throw new Error("REVISION_INTENT_CONTENT_REQUIRED");
  if (!input.scope.chapterIds.length) throw new Error("REVISION_SCOPE_REQUIRED");
  if (["author_accepted", "settled", "publication_ready"].includes(input.maturity) && input.mode === "in_place") throw new Error("REVISION_IN_PLACE_FORBIDDEN");
  if (input.actor !== "author") throw new Error("REVISION_AUTHOR_AUTHORITY_REQUIRED");
  const base = {
    schemaVersion: "revision-intent.v1" as const,
    intentId: `revision-intent-${crypto.randomUUID()}`,
    projectSlug: input.projectSlug,
    authorText: input.authorText.trim(),
    type: input.type,
    maturity: input.maturity,
    scope: { chapterIds: [...new Set(input.scope.chapterIds)].sort(), ...(input.scope.sceneIds ? { sceneIds: [...new Set(input.scope.sceneIds)].sort() } : {}) },
    requestedChanges: input.requestedChanges.map((item) => item.trim()).filter(Boolean),
    protectedItems: [...new Set(input.protectedItems.map((item) => item.trim()).filter(Boolean))].sort(),
    mode: input.mode,
    actor: input.actor,
    status: "proposed" as const,
    createdAt: new Date().toISOString()
  };
  const intent: RevisionIntent = { ...base, fingerprint: hash(base) };
  const target = intentPath(root, intent.intentId);
  const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(temporary, `${JSON.stringify(intent, null, 2)}\n`, "utf8");
  await fs.rename(temporary, target);
  return intent;
}

export async function listRevisionIntents(root: string): Promise<RevisionIntent[]> {
  const directory = resolveInside(root, "sessions/revisions/intents");
  let names: string[];
  try { names = await fs.readdir(directory); }
  catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return []; throw error; }
  return (await Promise.all(names.filter((name) => name.endsWith(".json")).sort().map(async (name) => JSON.parse(await fs.readFile(path.join(directory, name), "utf8")) as RevisionIntent))).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function readRevisionIntent(root: string, intentId: string): Promise<RevisionIntent | null> {
  try { return JSON.parse(await fs.readFile(intentPath(root, intentId), "utf8")) as RevisionIntent; }
  catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}
