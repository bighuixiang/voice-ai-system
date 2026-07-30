import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { checkAgentAvailability, listAgentProfiles, resolveAgentProfile } from "./agentConfig.js";
import type { ContextManifest } from "./contextManifest.js";
import type { UnderstandingBudgetReservation } from "./understandingBudget.js";
import type { UnderstandingRiskProfile } from "./understandingRiskProfile.js";
import { resolveInside } from "./pathSafety.js";

export interface UnderstandingCapabilityAuthorization {
  schemaVersion: "model-capability-authorization.v1";
  projectSlug: string;
  taskType: "creative-understanding";
  capabilityFloor: "understanding.v1";
  profileId: string;
  modelId?: string;
  provider: string;
  availability: "verified" | "unavailable";
  status: "authorized" | "rejected";
  modelCallAllowed: boolean;
  manifestFingerprint: string;
  riskProfileFingerprint: string;
  budgetReservationId: string;
  reason?: string;
  authorizedAt: string;
  fingerprint: string;
}

function authorizationFingerprint(authorization: UnderstandingCapabilityAuthorization): string {
  const { fingerprint: _fingerprint, ...base } = authorization;
  return crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex");
}

async function writeAuthorization(root: string, authorization: UnderstandingCapabilityAuthorization): Promise<void> {
  const target = resolveInside(root, "sessions/understanding-capability-authorization.json");
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(authorization, null, 2)}\n`, "utf8");
  await fs.rename(temp, target);
}

export async function readUnderstandingCapabilityAuthorization(root: string): Promise<UnderstandingCapabilityAuthorization | null> {
  try {
    const authorization = JSON.parse(await fs.readFile(resolveInside(root, "sessions/understanding-capability-authorization.json"), "utf8")) as UnderstandingCapabilityAuthorization;
    if (!authorization || authorization.fingerprint !== authorizationFingerprint(authorization)) throw new Error("UNDERSTANDING_CAPABILITY_INTEGRITY_FAILED");
    return authorization;
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null;
    throw error;
  }
}

export async function authorizeUnderstandingCapability(input: {
  root: string;
  projectSlug: string;
  manifest: ContextManifest | null;
  riskProfile: UnderstandingRiskProfile;
  budget: UnderstandingBudgetReservation | null;
  profileId?: string;
  modelId?: string;
}): Promise<UnderstandingCapabilityAuthorization> {
  if (!input.manifest) throw new Error("T0_MANIFEST_REQUIRED");
  if (!input.budget || input.budget.manifestFingerprint !== input.manifest.sourceFingerprint) throw new Error("BUDGET_RESERVATION_REQUIRED");
  let profile;
  try {
    if (input.profileId && !listAgentProfiles().some((candidate) => candidate.id === input.profileId)) {
      throw new Error("MODEL_PROFILE_UNAVAILABLE");
    }
    profile = resolveAgentProfile({ profileId: input.profileId, modelId: input.modelId });
  } catch {
    throw new Error("MODEL_PROFILE_UNAVAILABLE");
  }
  if (!profile.enabled) throw new Error("MODEL_PROFILE_UNAVAILABLE");
  const availability = await checkAgentAvailability({ profileId: profile.id, modelId: profile.model });
  const base = {
    schemaVersion: "model-capability-authorization.v1" as const,
    projectSlug: input.projectSlug,
    taskType: "creative-understanding" as const,
    capabilityFloor: "understanding.v1" as const,
    profileId: profile.id,
    ...(profile.model ? { modelId: profile.model } : {}),
    provider: profile.provider,
    availability: availability.available ? "verified" as const : "unavailable" as const,
    status: availability.available ? "authorized" as const : "rejected" as const,
    modelCallAllowed: availability.available,
    manifestFingerprint: input.manifest.sourceFingerprint,
    riskProfileFingerprint: input.riskProfile.fingerprint,
    budgetReservationId: input.budget.reservationId,
    ...(availability.available ? {} : { reason: availability.error || "Agent availability check failed" }),
    authorizedAt: new Date().toISOString()
  };
  const authorization = { ...base, fingerprint: crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex") };
  await writeAuthorization(input.root, authorization);
  return authorization;
}
