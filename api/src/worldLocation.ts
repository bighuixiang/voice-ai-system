import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";

export interface WorldTravelRoute { toLocationId: string; distance: string; travelMode: string; normalDuration: string; blockedDuration: string; accessConditions: string[]; risks: string[]; }
export interface WorldLocation {
  schemaVersion: "world-location.v1";
  locationId: string;
  projectSlug: string;
  name: string;
  hierarchy: string;
  region: string;
  travelRoutes: WorldTravelRoute[];
  accessConditions: string[];
  currentReachability: "reachable" | "blocked" | "unknown";
  sourceRefs: string[];
  createdAt: string;
  updatedAt: string;
  fingerprint: string;
}
function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function locationPath(root: string, id: string): string { return resolveInside(root, `sessions/world-locations/${id}.json`); }
async function writeJson(target: string, value: unknown): Promise<void> { await fs.mkdir(path.dirname(target), { recursive: true }); const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`; await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8"); await fs.rename(temp, target); }
async function readJson<T>(target: string): Promise<T | null> { try { return JSON.parse(await fs.readFile(target, "utf8")) as T; } catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; } }
export async function readWorldLocation(root: string, locationId: string): Promise<WorldLocation | null> { return readJson<WorldLocation>(locationPath(root, locationId)); }
export async function listWorldLocations(root: string, projectSlug: string): Promise<WorldLocation[]> { const directory = resolveInside(root, "sessions/world-locations"); let names: string[]; try { names = await fs.readdir(directory); } catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return []; throw error; } const records = await Promise.all(names.filter((name) => name.endsWith(".json")).map((name) => readJson<WorldLocation>(path.join(directory, name)))); return records.filter((record): record is WorldLocation => Boolean(record && record.projectSlug === projectSlug)).sort((a, b) => a.createdAt.localeCompare(b.createdAt)); }
export async function createWorldLocation(input: { root: string; projectSlug: string; locationId: string; name: string; hierarchy: string; region: string; travelRoutes: readonly WorldTravelRoute[]; accessConditions: readonly string[]; currentReachability: WorldLocation["currentReachability"]; sourceRefs: readonly string[] }): Promise<WorldLocation> {
  if (!input.projectSlug.trim() || !input.locationId.trim() || !input.name.trim() || !input.hierarchy.trim() || !input.region.trim()) throw new Error("WORLD_LOCATION_FIELDS_REQUIRED");
  if (!input.sourceRefs.length) throw new Error("WORLD_LOCATION_SOURCE_REQUIRED");
  if (!input.travelRoutes.length || input.travelRoutes.some((route) => !route.toLocationId.trim() || !route.distance.trim() || !route.travelMode.trim() || !route.normalDuration.trim() || !route.blockedDuration.trim())) throw new Error("WORLD_LOCATION_ROUTE_INVALID");
  const existing = await readWorldLocation(input.root, input.locationId); if (existing) return existing;
  const base = { schemaVersion: "world-location.v1" as const, locationId: input.locationId, projectSlug: input.projectSlug, name: input.name, hierarchy: input.hierarchy, region: input.region, travelRoutes: input.travelRoutes.map((route) => ({ ...route, accessConditions: [...route.accessConditions], risks: [...route.risks] })), accessConditions: [...input.accessConditions], currentReachability: input.currentReachability, sourceRefs: [...input.sourceRefs], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  const location: WorldLocation = { ...base, fingerprint: hash(base) }; await writeJson(locationPath(input.root, input.locationId), location); return location;
}
export function evaluateLocationReachability(location: WorldLocation, input: { destinationId: string; hasAccess: boolean }): "reachable" | "blocked" | "unknown" { const route = location.travelRoutes.find((item) => item.toLocationId === input.destinationId); if (!route) return "unknown"; if (location.currentReachability === "blocked" || !input.hasAccess) return "blocked"; if (location.currentReachability === "unknown") return "unknown"; return "reachable"; }
