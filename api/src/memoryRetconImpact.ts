import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";

export interface MemoryRetconImpactReport {
  schemaVersion: "memory-retcon-impact.v1";
  claimId: string;
  replacementClaimVersion: number;
  status: "clear" | "blocked-until-rebuild";
  affectedPaths: string[];
  affectedScopes: { prose: string[]; summaries: string[]; characterKnowledge: string[]; readerKnowledge: string[]; obligations: string[]; outlines: string[]; candidates: string[]; publications: string[] };
  actions: string[];
  reason: string;
  fingerprint: string;
}
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

async function pathContains(root: string, relativePath: string, token: string): Promise<boolean> {
  try { return (await fs.readFile(resolveInside(root, relativePath), "utf8")).includes(token); } catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return false; throw error; }
}
async function directoryExists(root: string, relativePath: string): Promise<boolean> {
  try { return (await fs.stat(resolveInside(root, relativePath))).isDirectory(); } catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return false; throw error; }
}

export async function buildMemoryRetconImpactReport(root: string, input: { claimId: string; replacementClaimVersion: number; reason: string }): Promise<MemoryRetconImpactReport> {
  if (!input.claimId.trim() || !input.reason.trim() || input.replacementClaimVersion < 1) throw new Error("MEMORY_RETCON_IMPACT_FIELDS_REQUIRED");
  const affectedPaths: string[] = [];
  if (await pathContains(root, "knowledge/facts.jsonl", input.claimId)) affectedPaths.push("knowledge/facts.jsonl");
  if (await pathContains(root, "knowledge/triples.jsonl", input.claimId)) affectedPaths.push("knowledge/triples.jsonl");
  if (await pathContains(root, "story-graph/storyline.json", input.claimId)) affectedPaths.push("story-graph/storyline.json");
  const runtimeExists = await directoryExists(root, "runtime/snapshots");
  const publicationExists = await directoryExists(root, "publication");
  if (runtimeExists) affectedPaths.push("runtime/snapshots/*");
  if (publicationExists) affectedPaths.push("publication/*");
  const actions = ["REBUILD_KNOWLEDGE_INDEX", "REBUILD_STORY_GRAPH", "INVALIDATE_RUNTIME_SNAPSHOTS", "REVALIDATE_PUBLICATION_DERIVATIVES"];
  const paths = affectedPaths.sort();
  const affectedScopes = {
    prose: paths.filter((item) => item.startsWith("chapters/") || item.startsWith("story-graph/")),
    summaries: paths.filter((item) => item.includes("summary")),
    characterKnowledge: paths.filter((item) => item.includes("character") && item.includes("knowledge")),
    readerKnowledge: paths.filter((item) => item.includes("reader") && item.includes("knowledge")),
    obligations: paths.filter((item) => item.includes("obligation")),
    outlines: paths.filter((item) => item.startsWith("outline/")),
    candidates: paths.filter((item) => item.includes("candidate")),
    publications: paths.filter((item) => item.startsWith("publication/"))
  };
  const base = { schemaVersion: "memory-retcon-impact.v1" as const, claimId: input.claimId, replacementClaimVersion: input.replacementClaimVersion, status: actions.length ? "blocked-until-rebuild" as const : "clear" as const, affectedPaths: paths, affectedScopes, actions, reason: input.reason };
  return { ...base, fingerprint: hash(base) };
}
