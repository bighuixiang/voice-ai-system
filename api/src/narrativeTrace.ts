import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";

export type NarrativeTraceRelation = "contains" | "realized_by" | "supports" | "pays_off" | "derived_from" | "constrains" | "revises";
export interface NarrativeTraceLink { schemaVersion: "narrative-trace-link.v1"; linkId: string; projectSlug: string; sourceLayer: string; sourceId: string; targetLayer: string; targetId: string; relation: NarrativeTraceRelation; evidenceRefs: string[]; createdAt: string; fingerprint: string; }
export interface NarrativeTraceReport { projectSlug: string; linkCount: number; layers: string[]; status: "passed" | "blocked"; issues: Array<{ kind: "orphan" | "missing-evidence"; linkId: string; detail: string }>; fingerprint: string; }
function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function linkPath(root: string, id: string): string { return resolveInside(root, `sessions/narrative-trace-links/${id}.json`); }
async function writeJson(target: string, value: unknown): Promise<void> { await fs.mkdir(path.dirname(target), { recursive: true }); const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`; await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8"); await fs.rename(temp, target); }
async function readJson<T>(target: string): Promise<T | null> { try { return JSON.parse(await fs.readFile(target, "utf8")) as T; } catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; } }
function nonEmpty(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function stringArray(value: unknown, required = false): value is string[] { return Array.isArray(value) && (!required || value.length > 0) && value.every(nonEmpty); }
export function assertNarrativeTraceLinkIntegrity(link: NarrativeTraceLink, expectedId?: string): NarrativeTraceLink {
  const { fingerprint, ...base } = link;
  const relations: NarrativeTraceRelation[] = ["contains", "realized_by", "supports", "pays_off", "derived_from", "constrains", "revises"];
  const valid = link.schemaVersion === "narrative-trace-link.v1" && (!expectedId || link.linkId === expectedId) && [link.linkId, link.projectSlug, link.sourceLayer, link.sourceId, link.targetLayer, link.targetId, link.createdAt].every(nonEmpty) && relations.includes(link.relation) && stringArray(link.evidenceRefs, true) && Number.isFinite(Date.parse(link.createdAt)) && /^[a-f0-9]{64}$/i.test(link.fingerprint) && hash(base) === link.fingerprint;
  if (!valid) throw new Error("NARRATIVE_TRACE_INTEGRITY_FAILED");
  return link;
}
export async function readNarrativeTraceLink(root: string, linkId: string): Promise<NarrativeTraceLink | null> { const link = await readJson<NarrativeTraceLink>(linkPath(root, linkId)); return link ? assertNarrativeTraceLinkIntegrity(link, linkId) : null; }
export async function listNarrativeTraceLinks(root: string, projectSlug: string): Promise<NarrativeTraceLink[]> { const directory = resolveInside(root, "sessions/narrative-trace-links"); let names: string[]; try { names = await fs.readdir(directory); } catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return []; throw error; } const records = await Promise.all(names.filter((name) => name.endsWith(".json")).map(async (name) => { const record = await readJson<NarrativeTraceLink>(path.join(directory, name)); return record ? assertNarrativeTraceLinkIntegrity(record, name.slice(0, -5)) : null; })); return records.filter((record): record is NarrativeTraceLink => Boolean(record && record.projectSlug === projectSlug)).sort((a, b) => a.createdAt.localeCompare(b.createdAt)); }
export async function createNarrativeTraceLink(input: { root: string; projectSlug: string; linkId: string; sourceLayer: string; sourceId: string; targetLayer: string; targetId: string; relation: NarrativeTraceRelation; evidenceRefs: readonly string[] }): Promise<NarrativeTraceLink> {
  if (!input.projectSlug.trim() || !input.linkId.trim() || !input.sourceLayer.trim() || !input.sourceId.trim() || !input.targetLayer.trim() || !input.targetId.trim()) throw new Error("NARRATIVE_TRACE_ENDPOINT_REQUIRED");
  if (!input.evidenceRefs.length) throw new Error("NARRATIVE_TRACE_EVIDENCE_REQUIRED");
  const existing = await readNarrativeTraceLink(input.root, input.linkId); if (existing) return existing;
  const base = { schemaVersion: "narrative-trace-link.v1" as const, linkId: input.linkId, projectSlug: input.projectSlug, sourceLayer: input.sourceLayer, sourceId: input.sourceId, targetLayer: input.targetLayer, targetId: input.targetId, relation: input.relation, evidenceRefs: [...input.evidenceRefs], createdAt: new Date().toISOString() };
  const link: NarrativeTraceLink = { ...base, fingerprint: hash(base) }; await writeJson(linkPath(input.root, input.linkId), link); return link;
}
export async function validateNarrativeTrace(root: string, projectSlug: string): Promise<NarrativeTraceReport> {
  const links = await listNarrativeTraceLinks(root, projectSlug); const issues: NarrativeTraceReport["issues"] = []; const layers = new Set<string>();
  for (const link of links) { layers.add(link.sourceLayer); layers.add(link.targetLayer); if (!link.sourceId || !link.targetId) issues.push({ kind: "orphan", linkId: link.linkId, detail: "Trace link has an empty endpoint." }); if (!link.evidenceRefs.length) issues.push({ kind: "missing-evidence", linkId: link.linkId, detail: "Trace link has no evidence." }); }
  return { projectSlug, linkCount: links.length, layers: [...layers].sort(), status: issues.length ? "blocked" : "passed", issues, fingerprint: hash({ projectSlug, links: links.map((link) => link.fingerprint), issues }) };
}
