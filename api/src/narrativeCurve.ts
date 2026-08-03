import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";

export interface NarrativeCurveDimensions { pressure: number; information: number; emotion: number; relationship: number; progression: number; payoff: number; }
export interface NarrativeCurvePoint { schemaVersion: "narrative-curve-point.v1"; pointId: string; projectSlug: string; chapterId: string; sceneId: string; dimensions: NarrativeCurveDimensions; whiteSpace: string[]; evidenceRefs: string[]; createdAt: string; fingerprint: string; }
export interface NarrativeCurveAssessment { schemaVersion: "narrative-curve-assessment.v1"; status: "clear" | "risk"; riskCodes: string[]; evidence: Array<{ code: string; startIndex: number; endIndex: number; detail: string }>; fingerprint: string; }
function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function longestStreak(points: ReadonlyArray<{ dimensions: NarrativeCurveDimensions }>, predicate: (dimensions: NarrativeCurveDimensions) => boolean): { length: number; startIndex: number; endIndex: number } {
  let best = { length: 0, startIndex: -1, endIndex: -1 }; let start = -1;
  points.forEach((point, index) => { if (predicate(point.dimensions)) { if (start < 0) start = index; const length = index - start + 1; if (length > best.length) best = { length, startIndex: start, endIndex: index }; } else start = -1; });
  return best;
}
export function assessNarrativeCurve(points: ReadonlyArray<{ dimensions: NarrativeCurveDimensions }>): NarrativeCurveAssessment {
  if (!points.length) throw new Error("NARRATIVE_CURVE_POINTS_REQUIRED");
  const evidence: NarrativeCurveAssessment["evidence"] = [];
  const pressure = longestStreak(points, (d) => d.pressure >= 80); if (pressure.length >= 3) evidence.push({ code: "CONTINUOUS_HIGH_PRESSURE", startIndex: pressure.startIndex, endIndex: pressure.endIndex, detail: `pressure stayed at or above 80 for ${pressure.length} points; add a decompression or vary the load.` });
  const lowChange = longestStreak(points, (d) => d.pressure <= 50 && d.information <= 25 && d.progression <= 20); if (lowChange.length >= 3) evidence.push({ code: "CONTINUOUS_LOW_CHANGE", startIndex: lowChange.startIndex, endIndex: lowChange.endIndex, detail: `pressure, information, and progression remained low across ${lowChange.length} points; introduce a meaningful change or deliberate whitespace.` });
  const payoff = longestStreak(points, (d) => d.payoff < 20); if (payoff.length >= 4) evidence.push({ code: "PAYOFF_DEFICIT", startIndex: payoff.startIndex, endIndex: payoff.endIndex, detail: `payoff stayed below 20 for ${payoff.length} points; schedule a payoff or record why the delay is intentional.` });
  const base = { schemaVersion: "narrative-curve-assessment.v1" as const, status: evidence.length ? "risk" as const : "clear" as const, riskCodes: evidence.map((item) => item.code), evidence }; return { ...base, fingerprint: hash(base) };
}
function pointPath(root: string, id: string): string { return resolveInside(root, `sessions/narrative-curve-points/${id}.json`); }
async function writeJson(target: string, value: unknown): Promise<void> { await fs.mkdir(path.dirname(target), { recursive: true }); const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`; await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8"); await fs.rename(temp, target); }
async function readJson<T>(target: string): Promise<T | null> { try { return JSON.parse(await fs.readFile(target, "utf8")) as T; } catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; } }
function nonEmpty(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function stringArray(value: unknown, required = false): value is string[] { return Array.isArray(value) && (!required || value.length > 0) && value.every(nonEmpty); }
const curveDimensions: Array<keyof NarrativeCurveDimensions> = ["pressure", "information", "emotion", "relationship", "progression", "payoff"];
export function assertNarrativeCurvePointIntegrity(point: NarrativeCurvePoint, expectedId?: string): NarrativeCurvePoint {
  const { fingerprint, ...base } = point;
  const dimensionsValid = Boolean(point.dimensions && curveDimensions.every((key) => Number.isFinite(point.dimensions[key]) && point.dimensions[key] >= 0 && point.dimensions[key] <= 100) && Object.keys(point.dimensions).sort().join(",") === curveDimensions.slice().sort().join(","));
  const valid = point.schemaVersion === "narrative-curve-point.v1" && (!expectedId || point.pointId === expectedId) && [point.pointId, point.projectSlug, point.chapterId, point.sceneId, point.createdAt].every(nonEmpty) && dimensionsValid && stringArray(point.whiteSpace) && stringArray(point.evidenceRefs, true) && Number.isFinite(Date.parse(point.createdAt)) && /^[a-f0-9]{64}$/i.test(point.fingerprint) && hash(base) === point.fingerprint;
  if (!valid) throw new Error("NARRATIVE_CURVE_INTEGRITY_FAILED");
  return point;
}
export async function readNarrativeCurvePoint(root: string, pointId: string): Promise<NarrativeCurvePoint | null> { const point = await readJson<NarrativeCurvePoint>(pointPath(root, pointId)); return point ? assertNarrativeCurvePointIntegrity(point, pointId) : null; }
export async function listNarrativeCurvePoints(root: string, projectSlug: string): Promise<NarrativeCurvePoint[]> { const directory = resolveInside(root, "sessions/narrative-curve-points"); let names: string[]; try { names = await fs.readdir(directory); } catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return []; throw error; } const records = await Promise.all(names.filter((name) => name.endsWith(".json")).map(async (name) => { const record = await readJson<NarrativeCurvePoint>(path.join(directory, name)); return record ? assertNarrativeCurvePointIntegrity(record, name.slice(0, -5)) : null; })); return records.filter((record): record is NarrativeCurvePoint => Boolean(record && record.projectSlug === projectSlug)).sort((a, b) => a.chapterId.localeCompare(b.chapterId) || a.sceneId.localeCompare(b.sceneId)); }
export async function createNarrativeCurvePoint(input: { root: string; projectSlug: string; pointId: string; chapterId: string; sceneId: string; dimensions: NarrativeCurvePoint["dimensions"]; whiteSpace: readonly string[]; evidenceRefs: readonly string[] }): Promise<NarrativeCurvePoint> {
  if (!input.projectSlug.trim() || !input.pointId.trim() || !input.chapterId.trim() || !input.sceneId.trim()) throw new Error("NARRATIVE_CURVE_FIELDS_REQUIRED");
  if (Object.values(input.dimensions).some((value) => !Number.isFinite(value) || value < 0 || value > 100)) throw new Error("NARRATIVE_CURVE_DIMENSION_RANGE");
  if (!input.evidenceRefs.length) throw new Error("NARRATIVE_CURVE_EVIDENCE_REQUIRED");
  const existing = await readNarrativeCurvePoint(input.root, input.pointId); if (existing) return existing;
  const base = { schemaVersion: "narrative-curve-point.v1" as const, pointId: input.pointId, projectSlug: input.projectSlug, chapterId: input.chapterId, sceneId: input.sceneId, dimensions: { ...input.dimensions }, whiteSpace: [...input.whiteSpace], evidenceRefs: [...input.evidenceRefs], createdAt: new Date().toISOString() };
  const point: NarrativeCurvePoint = { ...base, fingerprint: hash(base) }; await writeJson(pointPath(input.root, input.pointId), point); return point;
}
