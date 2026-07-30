import type { WorldLocation } from "./worldLocation.js";

export interface WorldTravelEvidence {
  kind: "travel" | "authorized_jump";
  actorId: string;
  fromLocationId: string;
  toLocationId: string;
  mode: string;
  duration: string;
  routeRisk: string[];
  evidenceRefs: string[];
  authorizationReason?: string;
}

export function recordWorldTravel(input: {
  from: WorldLocation;
  toLocationId: string;
  actorId: string;
  mode: string;
  evidenceRefs: readonly string[];
  authorizationReason?: string;
}): WorldTravelEvidence {
  if (!input.actorId.trim() || !input.toLocationId.trim() || !input.mode.trim()) throw new Error("WORLD_TRAVEL_FIELDS_REQUIRED");
  if (input.from.currentReachability === "blocked") throw new Error("WORLD_TRAVEL_BLOCKED");
  if (input.from.currentReachability === "unknown") throw new Error("WORLD_TRAVEL_REACHABILITY_UNKNOWN");
  const route = input.from.travelRoutes.find((item) => item.toLocationId === input.toLocationId);
  if (!route) {
    if (!input.authorizationReason?.trim() || !input.evidenceRefs.length) throw new Error("WORLD_TRAVEL_PATH_REQUIRED");
    return { kind: "authorized_jump", actorId: input.actorId, fromLocationId: input.from.locationId, toLocationId: input.toLocationId, mode: input.mode, duration: "instant", routeRisk: [], evidenceRefs: [...input.evidenceRefs], authorizationReason: input.authorizationReason };
  }
  if (!input.evidenceRefs.length) throw new Error("WORLD_TRAVEL_EVIDENCE_REQUIRED");
  return { kind: "travel", actorId: input.actorId, fromLocationId: input.from.locationId, toLocationId: input.toLocationId, mode: input.mode, duration: route.normalDuration, routeRisk: [...route.risks], evidenceRefs: [...input.evidenceRefs] };
}
