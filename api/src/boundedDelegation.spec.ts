import { describe, expect, it } from "vitest";
import { authorizeBoundedDelegation, createBoundedDelegationGrant, revokeBoundedDelegation } from "./boundedDelegation.js";

describe("bounded delegation", () => {
  it("limits a city-name delegation and revocation invalidates pending work", () => {
    const grant = createBoundedDelegationGrant({ grantId: "g-city", scope: ["city-name"], allowedActions: ["city-name.choose"], expiresAt: "2030-01-01T00:00:00Z" });
    expect(authorizeBoundedDelegation(grant, "city-name.choose", "2027-01-01T00:00:00Z").allowed).toBe(true);
    expect(authorizeBoundedDelegation(grant, "character-death.choose", "2027-01-01T00:00:00Z").allowed).toBe(false);
    const revoked = revokeBoundedDelegation(grant, "author revoked naming delegation");
    expect(authorizeBoundedDelegation(revoked, "city-name.choose", "2027-01-01T00:00:00Z")).toMatchObject({ allowed: false, reason: "DELEGATION_REVOKED" });
  });
  it("rejects forbidden scope and expired grants", () => {
    expect(() => createBoundedDelegationGrant({ grantId: "g-bad", scope: ["budget"], allowedActions: ["budget.raise"], expiresAt: "2030-01-01T00:00:00Z" })).toThrow("BOUNDED_DELEGATION_SCOPE_FORBIDDEN");
    const grant = createBoundedDelegationGrant({ grantId: "g-expired", scope: ["city-name"], allowedActions: ["city-name.choose"], expiresAt: "2020-01-01T00:00:00Z" });
    expect(authorizeBoundedDelegation(grant, "city-name.choose", "2027-01-01T00:00:00Z").reason).toBe("DELEGATION_EXPIRED");
  });
});
