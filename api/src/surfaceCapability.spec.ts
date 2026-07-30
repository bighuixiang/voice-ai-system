import { describe, expect, it } from "vitest";
import { authorizeSurfaceCommand, createSurfaceCapabilityRegistry, registerSurfaceCapability } from "./surfaceCapability.js";

const capability = {
  surfaceId: "creative-session",
  label: "Creative session",
  reads: ["creative-journey-projection"],
  commands: ["append-author-message", "update-session-state"],
  writeAuthority: "creative-session",
  stages: ["capture", "understanding"],
  alternativeSurfaceId: "legacy-project-create",
  retirementCondition: "RP1 browser equivalence and rollback evidence",
  lifecycle: "active" as const
};

describe("surface capability registry", () => {
  it("registers versioned writable surface capabilities", () => {
    const registry = createSurfaceCapabilityRegistry("p1");
    const result = registerSurfaceCapability(registry, capability);
    expect(result.registry.schemaVersion).toBe("surface-capability-registry.v1");
    expect(result.registry.capabilities[0]).toMatchObject({ surfaceId: "creative-session", writeAuthority: "creative-session" });
  });

  it("allows declared commands only in declared stages", () => {
    const registry = registerSurfaceCapability(createSurfaceCapabilityRegistry("p1"), capability).registry;
    expect(authorizeSurfaceCommand(registry, { surfaceId: "creative-session", command: "append-author-message", stage: "capture", write: true })).toMatchObject({ allowed: true });
    expect(authorizeSurfaceCommand(registry, { surfaceId: "creative-session", command: "append-author-message", stage: "contract", write: true })).toMatchObject({ allowed: false, reason: "stage-not-supported" });
  });

  it("keeps unknown surfaces read-only and blocks retired writes", () => {
    const registry = registerSurfaceCapability(createSurfaceCapabilityRegistry("p1"), { ...capability, lifecycle: "retired" as const }).registry;
    expect(authorizeSurfaceCommand(registry, { surfaceId: "unknown", command: "anything", stage: "capture", write: true })).toMatchObject({ allowed: false, readOnly: true, reason: "surface-unregistered" });
    expect(authorizeSurfaceCommand(registry, { surfaceId: "creative-session", command: "append-author-message", stage: "capture", write: true })).toMatchObject({ allowed: false, reason: "surface-retired" });
  });

  it("rejects duplicate surface IDs and undeclared writes", () => {
    const registry = registerSurfaceCapability(createSurfaceCapabilityRegistry("p1"), capability).registry;
    expect(() => registerSurfaceCapability(registry, capability)).toThrow("SURFACE_DUPLICATE");
    expect(authorizeSurfaceCommand(registry, { surfaceId: "creative-session", command: "read-only-inspection", stage: "capture", write: true })).toMatchObject({ allowed: false, reason: "command-not-registered" });
  });
});
