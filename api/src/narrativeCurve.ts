import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";

export interface NarrativeCurvePoint { schemaVersion: "narrative-curve-point.v1"; pointId: string; projectSlug: string; chapterId: string; sceneId: string; dimensions: { pressure: number; information: number; emotion: number; relationship: number; progression: number; payoff: number }; whiteSpace: string[]; evidenceRefs: string[]; createdAt: string; fingerprint: string; }
function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function pointPath(root: string, id: string): string { return resolveInside(root, `sessions/narrative-curve-points/${id}.json`); }
async function writeJson(target: string, value: unknown): Promise<void> { await fs.mkdir(path.dirname(target), { recursive: true }); const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`; await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8"); await fs.rename(temp, target); }
async function readJson<T>(target: string): Promise<T | null> { try { return JSON.parse(await fs.readFile(target, "utf8")) as T; } catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; } }
export async function readNarrativeCurvePoint(root: string, pointId: string): Promise<NarrativeCurvePoint | null> { return readJson<NarrativeCurvePoint>(pointPath(root, pointId)); }
export async function listNarrativeCurvePoints(root: string, projectSlug: string): Promise<NarrativeCurvePoint[]> { const directory = resolveInside(root, "sessions/narrative-curve-points"); let names: string[]; try { names = await fs.readdir(directory); } catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return []; throw error; } const records = await Promise.all(names.filter((name) => name.endsWith(".json")).map((name) => readJson<NarrativeCurvePoint>(path.join(directory, name)))); return records.filter((record): record is NarrativeCurvePoint => Boolean(record && record.projectSlug === projectSlug)).sort((a, b) => a.chapterId.localeCompare(b.chapterId) || a.sceneId.localeCompare(b.sceneId)); }
export async function createNarrativeCurvePoint(input: { root: string; projectSlug: string; pointId: string; chapterId: string; sceneId: string; dimensions: NarrativeCurvePoint["dimensions"]; whiteSpace: readonly string[]; evidenceRefs: readonly string[] }): Promise<NarrativeCurvePoint> {
  if (!input.projectSlug.trim() || !input.pointId.trim() || !input.chapterId.trim() || !input.sceneId.trim()) throw new Error("NARRATIVE_CURVE_FIELDS_REQUIRED");
  if (Object.values(input.dimensions).some((value) => !Number.isFinite(value) || value < 0 || value > 100)) throw new Error("NARRATIVE_CURVE_DIMENSION_RANGE");
  if (!input.evidenceRefs.length) throw new Error("NARRATIVE_CURVE_EVIDENCE_REQUIRED");
  const existing = await readNarrativeCurvePoint(input.root, input.pointId); if (existing) return existing;
  const base = { schemaVersion: "narrative-curve-point.v1" as const, pointId: input.pointId, projectSlug: input.projectSlug, chapterId: input.chapterId, sceneId: input.sceneId, dimensions: { ...input.dimensions }, whiteSpace: [...input.whiteSpace], evidenceRefs: [...input.evidenceRefs], createdAt: new Date().toISOString() };
  const point: NarrativeCurvePoint = { ...base, fingerprint: hash(base) }; await writeJson(pointPath(input.root, input.pointId), point); return point;
}
