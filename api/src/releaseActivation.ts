import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";

export interface ReleaseActivation {
  schemaVersion: "release-activation.v1";
  status: "active";
  releaseProfile: "RP5-drafting";
  acceptanceFingerprint: string;
  activatedAt: string;
  fingerprint: string;
}

interface AcceptanceDecision {
  status: "accepted" | "do-not-activate";
  releaseProfile: "RP5-drafting";
  fingerprint: string;
}

function activationPath(root: string): string { return resolveInside(root, "release-activation.json"); }
function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function isValidActivation(value: ReleaseActivation): boolean {
  const { fingerprint, ...base } = value;
  return value.schemaVersion === "release-activation.v1" && value.status === "active" && value.releaseProfile === "RP5-drafting" && typeof value.acceptanceFingerprint === "string" && /^[a-f0-9]{64}$/i.test(value.acceptanceFingerprint) && typeof value.activatedAt === "string" && value.activatedAt.trim() !== "" && Number.isFinite(Date.parse(value.activatedAt)) && /^[a-f0-9]{64}$/i.test(fingerprint) && hash(base) === fingerprint;
}

async function writeJson(target: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temporary, target);
}

export async function readReleaseActivation(root: string): Promise<ReleaseActivation | null> {
  try {
    const value = JSON.parse(await fs.readFile(activationPath(root), "utf8")) as ReleaseActivation;
    if (!isValidActivation(value)) throw new Error("RELEASE_ACTIVATION_CORRUPT");
    return value;
  }
  catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null;
    throw error;
  }
}

export async function activateRelease(root: string, decision: AcceptanceDecision): Promise<ReleaseActivation> {
  if (decision.status !== "accepted") throw new Error("RELEASE_ACCEPTANCE_REQUIRED");
  if (decision.releaseProfile !== "RP5-drafting") throw new Error("RELEASE_PROFILE_UNSUPPORTED");
  if (!/^[a-f0-9]{64}$/i.test(decision.fingerprint)) throw new Error("RELEASE_ACCEPTANCE_FINGERPRINT_INVALID");
  const existing = await readReleaseActivation(root);
  if (existing) {
    if (!isValidActivation(existing)) throw new Error("RELEASE_ACTIVATION_CORRUPT");
    if (existing.acceptanceFingerprint === decision.fingerprint) return existing;
    throw new Error("RELEASE_ACTIVATION_STALE");
  }
  const base = {
    schemaVersion: "release-activation.v1" as const,
    status: "active" as const,
    releaseProfile: decision.releaseProfile,
    acceptanceFingerprint: decision.fingerprint,
    activatedAt: new Date().toISOString()
  };
  const activation: ReleaseActivation = { ...base, fingerprint: hash(base) };
  await writeJson(activationPath(root), activation);
  return activation;
}
