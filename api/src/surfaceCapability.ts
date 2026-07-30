import crypto from "node:crypto";

export type SurfaceLifecycle = "active" | "shadow" | "retired";
export interface SurfaceCapability {
  schemaVersion: "surface-capability.v1";
  surfaceId: string;
  label: string;
  reads: string[];
  commands: string[];
  writeAuthority: string;
  stages: string[];
  alternativeSurfaceId: string;
  retirementCondition: string;
  lifecycle: SurfaceLifecycle;
  fingerprint: string;
}
export interface SurfaceCapabilityRegistry {
  schemaVersion: "surface-capability-registry.v1";
  projectSlug: string;
  registryVersion: number;
  capabilities: SurfaceCapability[];
  fingerprint: string;
}
export interface SurfaceAuthorization {
  allowed: boolean;
  readOnly: boolean;
  reason: "authorized" | "surface-unregistered" | "surface-retired" | "surface-shadow" | "stage-not-supported" | "command-not-registered";
  writeAuthority?: string;
  alternativeSurfaceId?: string;
}

const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
function registryFingerprint(value: Omit<SurfaceCapabilityRegistry, "fingerprint">) { return hash(value); }

export function createSurfaceCapabilityRegistry(projectSlug: string): SurfaceCapabilityRegistry {
  if (!projectSlug.trim()) throw new Error("SURFACE_PROJECT_REQUIRED");
  const base = { schemaVersion: "surface-capability-registry.v1" as const, projectSlug, registryVersion: 1, capabilities: [] as SurfaceCapability[] };
  return { ...base, fingerprint: registryFingerprint(base) };
}

export function registerSurfaceCapability(registry: SurfaceCapabilityRegistry, input: Omit<SurfaceCapability, "schemaVersion" | "fingerprint">): { registry: SurfaceCapabilityRegistry; capability: SurfaceCapability } {
  if (!input.surfaceId.trim() || !input.label.trim() || !input.writeAuthority.trim() || !input.stages.length || !input.commands.length || !input.alternativeSurfaceId.trim() || !input.retirementCondition.trim()) throw new Error("SURFACE_CAPABILITY_FIELDS_REQUIRED");
  if (registry.capabilities.some((item) => item.surfaceId === input.surfaceId)) throw new Error("SURFACE_DUPLICATE");
  const capabilityBase = { schemaVersion: "surface-capability.v1" as const, ...input, reads: [...input.reads], commands: [...input.commands], stages: [...input.stages] };
  const capability = { ...capabilityBase, fingerprint: hash(capabilityBase) };
  const registryBase = { ...registry, registryVersion: registry.registryVersion + 1, capabilities: [...registry.capabilities, capability] };
  return { capability, registry: { ...registryBase, fingerprint: registryFingerprint(registryBase) } };
}

export function authorizeSurfaceCommand(registry: SurfaceCapabilityRegistry, input: { surfaceId: string; command: string; stage: string; write: boolean }): SurfaceAuthorization {
  const capability = registry.capabilities.find((item) => item.surfaceId === input.surfaceId);
  if (!capability) return { allowed: !input.write, readOnly: true, reason: "surface-unregistered" };
  if (capability.lifecycle === "retired") return { allowed: !input.write, readOnly: !input.write, reason: "surface-retired", alternativeSurfaceId: capability.alternativeSurfaceId };
  if (capability.lifecycle === "shadow" && input.write) return { allowed: false, readOnly: true, reason: "surface-shadow", alternativeSurfaceId: capability.alternativeSurfaceId };
  if (!capability.stages.includes(input.stage)) return { allowed: false, readOnly: !input.write, reason: "stage-not-supported", alternativeSurfaceId: capability.alternativeSurfaceId };
  if (input.write && !capability.commands.includes(input.command)) return { allowed: false, readOnly: false, reason: "command-not-registered", writeAuthority: capability.writeAuthority };
  return { allowed: true, readOnly: false, reason: "authorized", writeAuthority: input.write ? capability.writeAuthority : undefined };
}
