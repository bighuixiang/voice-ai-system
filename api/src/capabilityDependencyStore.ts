import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import type { CapabilityDependencyProof } from "./deliveryGovernance.js";

function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function proofPath(root: string, sliceId: string): string { return resolveInside(root, `sessions/capability-dependency-proofs/${hash(sliceId).slice(0, 32)}.json`); }
export async function removeCapabilityDependencyProof(root: string, sliceId: string, expectedFingerprint?: string): Promise<void> {
  const current = await readCapabilityDependencyProof(root, sliceId);
  if (!current) return;
  if (expectedFingerprint && current.fingerprint !== expectedFingerprint) throw new Error("CAPABILITY_DEPENDENCY_STALE");
  await fs.rm(proofPath(root, sliceId), { force: true });
}
function assertIntegrity(proof: CapabilityDependencyProof): void {
  const { fingerprint, ...base } = proof;
  if (hash(base) !== fingerprint) throw new Error("CAPABILITY_DEPENDENCY_INTEGRITY_FAILED");
}

export async function writeCapabilityDependencyProof(root: string, proof: CapabilityDependencyProof, expectedFingerprint?: string): Promise<CapabilityDependencyProof> {
  assertIntegrity(proof);
  const current = await readCapabilityDependencyProof(root, proof.sliceId, proof.projectSlug);
  if (current && !expectedFingerprint) throw new Error("CAPABILITY_DEPENDENCY_EXPECTED_FINGERPRINT_REQUIRED");
  if (current && expectedFingerprint !== current.fingerprint) throw new Error("CAPABILITY_DEPENDENCY_STALE");
  const target = proofPath(root, proof.sliceId);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(proof, null, 2)}\n`, "utf8");
  await fs.rename(temp, target);
  return proof;
}

export async function readCapabilityDependencyProof(root: string, sliceId: string, projectSlug?: string): Promise<CapabilityDependencyProof | null> {
  try {
    const proof = JSON.parse(await fs.readFile(proofPath(root, sliceId), "utf8")) as CapabilityDependencyProof;
    if (proof.schemaVersion !== "capability-dependency-proof.v1" || proof.sliceId !== sliceId || (projectSlug && proof.projectSlug !== projectSlug)) throw new Error("CAPABILITY_DEPENDENCY_INVALID");
    assertIntegrity(proof);
    return proof;
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null;
    throw error;
  }
}
