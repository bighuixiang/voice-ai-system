import { describe, expect, it } from "vitest";
import { recordWorldTravel } from "./worldTravel.js";
import type { WorldLocation } from "./worldLocation.js";

const location = (reachability: WorldLocation["currentReachability"] = "reachable"): WorldLocation => ({
  schemaVersion: "world-location.v1", locationId: "gate", projectSlug: "demo", name: "Gate", hierarchy: "city/gate", region: "north",
  travelRoutes: [{ toLocationId: "market", distance: "3 km", travelMode: "foot", normalDuration: "1h", blockedDuration: "1d", accessConditions: [], risks: ["patrol"] }],
  accessConditions: [], currentReachability: reachability, sourceRefs: ["map://gate"], createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", fingerprint: "fp"
});

describe("world travel evidence", () => {
  it("records a connected route only with travel evidence", () => {
    const result = recordWorldTravel({ from: location(), toLocationId: "market", actorId: "hero", mode: "foot", evidenceRefs: ["scene://12"] });
    expect(result.kind).toBe("travel");
    expect(result.duration).toBe("1h");
    expect(result.routeRisk).toEqual(["patrol"]);
  });

  it("requires explicit authorization evidence for a non-route jump", () => {
    expect(() => recordWorldTravel({ from: location(), toLocationId: "palace", actorId: "hero", mode: "teleport", evidenceRefs: [] })).toThrow("WORLD_TRAVEL_PATH_REQUIRED");
    const result = recordWorldTravel({ from: location(), toLocationId: "palace", actorId: "hero", mode: "authorized-jump", evidenceRefs: ["order://7"], authorizationReason: "royal seal" });
    expect(result.kind).toBe("authorized_jump");
  });

  it("blocks travel from blocked or unknown locations", () => {
    expect(() => recordWorldTravel({ from: location("blocked"), toLocationId: "market", actorId: "hero", mode: "foot", evidenceRefs: ["scene://13"] })).toThrow("WORLD_TRAVEL_BLOCKED");
    expect(() => recordWorldTravel({ from: location("unknown"), toLocationId: "market", actorId: "hero", mode: "foot", evidenceRefs: ["scene://13"] })).toThrow("WORLD_TRAVEL_REACHABILITY_UNKNOWN");
  });
});
