import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createWorldLocation, evaluateLocationReachability, listWorldLocations, readWorldLocation } from "./worldLocation.js";
import crypto from "node:crypto";

const input = (root: string, locationId = "north-gate") => ({ root, projectSlug: "demo", locationId, name: "North Gate", hierarchy: "city/gate", region: "north", travelRoutes: [{ toLocationId: "inner-city", distance: "3 km", travelMode: "foot", normalDuration: "1h", blockedDuration: "1d", accessConditions: ["gate pass"], risks: ["patrol"] }], accessConditions: ["city charter"], currentReachability: "reachable" as const, sourceRefs: ["map://north"] });

describe("world location", () => {
  it("keeps stable identity and route constraints", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "world-location-"));
    const location = await createWorldLocation(input(root));
    expect(location.schemaVersion).toBe("world-location.v1");
    expect(location.travelRoutes[0].blockedDuration).toBe("1d");
    expect(await readWorldLocation(root, location.locationId)).toEqual(location);
  });

  it("is idempotent, filters by project, and reports unknown destination", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "world-location-"));
    const location = await createWorldLocation(input(root));
    expect(await createWorldLocation(input(root))).toEqual(location);
    expect(await listWorldLocations(root, "other")).toEqual([]);
    expect(evaluateLocationReachability(location, { destinationId: "inner-city", hasAccess: true })).toBe("reachable");
    expect(evaluateLocationReachability(location, { destinationId: "unknown", hasAccess: true })).toBe("unknown");
  });

  it("requires source refs and route timing", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "world-location-"));
    await expect(createWorldLocation({ ...input(root), sourceRefs: [] })).rejects.toThrow("WORLD_LOCATION_SOURCE_REQUIRED");
    await expect(createWorldLocation({ ...input(root), travelRoutes: [{ ...input(root).travelRoutes[0], normalDuration: "" }] })).rejects.toThrow("WORLD_LOCATION_ROUTE_INVALID");
  });

  it("fails closed when a re-signed route loses its blocked duration", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "world-location-tamper-"));
    const location = await createWorldLocation(input(root));
    const target = path.join(root, "sessions", "world-locations", `${location.locationId}.json`);
    const { fingerprint: _old, ...base } = JSON.parse(await fs.readFile(target, "utf8")) as Record<string, unknown>;
    const routes = base.travelRoutes as Array<Record<string, unknown>>;
    const resigned = { ...base, travelRoutes: [{ ...routes[0], blockedDuration: "" }] };
    resigned.fingerprint = crypto.createHash("sha256").update(JSON.stringify(resigned)).digest("hex");
    await fs.writeFile(target, JSON.stringify(resigned), "utf8");
    await expect(readWorldLocation(root, location.locationId)).rejects.toThrow("WORLD_LOCATION_INTEGRITY_FAILED");
  });
});
