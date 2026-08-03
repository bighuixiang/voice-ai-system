import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import type { KernelProof } from "./kernelGovernance.js";

function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function proofPath(root: string, kernelId: string): string { return resolveInside(root, `sessions/kernel-proofs/${hash(kernelId).slice(0, 32)}.json`); }
function assertIntegrity(proof: KernelProof): void { const { fingerprint, ...base } = proof; if (hash(base) !== fingerprint) throw new Error("KERNEL_PROOF_INTEGRITY_FAILED"); }

export async function writeKernelProof(root: string, proof: KernelProof): Promise<KernelProof> {
  assertIntegrity(proof);
  const target = proofPath(root, proof.kernelId);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(proof, null, 2)}\n`, "utf8");
  await fs.rename(temp, target);
  return proof;
}

export async function readKernelProof(root: string, kernelId: string, projectSlug?: string): Promise<KernelProof | null> {
  try {
    const proof = JSON.parse(await fs.readFile(proofPath(root, kernelId), "utf8")) as KernelProof;
    if (proof.schemaVersion !== "kernel-proof.v1" || proof.kernelId !== kernelId || proof.unknownVersionPolicy !== "read-only" || (projectSlug && proof.projectSlug !== projectSlug)) throw new Error("KERNEL_PROOF_INVALID");
    assertIntegrity(proof);
    return proof;
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null;
    throw error;
  }
}
