import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";

export type RunReadinessStatus = "ready" | "blocked";

export interface RunReadinessProof {
  schemaVersion: "run-readiness-proof.v1";
  proofId: string;
  bookRunId: string;
  projectSlug: string;
  runVersion: number;
  scopeFingerprint: string;
  status: RunReadinessStatus;
  dependencyGraphStatus?: "ready" | "blocked" | "missing";
  evidence: {
    frozenPublicationScope: "present" | "missing";
    storyContract: "present" | "missing";
    workGraph: "present" | "missing";
    contextManifest: "present" | "missing";
    budgetReservation: "present" | "missing";
  };
  blockedReasons: string[];
  evaluatedAt: string;
  fingerprint: string;
}

const hash = (value: unknown): string => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const proofPath = (root: string, proofId: string): string => resolveInside(root, `sessions/book-runs/${proofId}.readiness.json`);

function assertInput(value: { bookRunId: string; projectSlug: string; runVersion: number; scopeFingerprint: string }): void {
  if (!value.bookRunId.trim() || !value.projectSlug.trim() || !Number.isInteger(value.runVersion) || value.runVersion < 1 || !/^[a-f0-9]{64}$/i.test(value.scopeFingerprint)) {
    throw new Error("RUN_READINESS_INPUT_INVALID");
  }
}

export function createRunReadinessProof(input: {
  bookRunId: string;
  projectSlug: string;
  runVersion: number;
  scopeFingerprint: string;
  frozenPublicationScope: boolean;
  storyContract: boolean;
  workGraph: boolean;
  contextManifest: boolean;
  budgetReservation: boolean;
  dependencyGraphStatus?: "ready" | "blocked" | "missing";
  evaluatedAt?: string;
}): RunReadinessProof {
  assertInput(input);
  const evidence = {
    frozenPublicationScope: input.frozenPublicationScope ? "present" : "missing",
    storyContract: input.storyContract ? "present" : "missing",
    workGraph: input.workGraph ? "present" : "missing",
    contextManifest: input.contextManifest ? "present" : "missing",
    budgetReservation: input.budgetReservation ? "present" : "missing"
  } as const;
  const dependencyGraphStatus = input.dependencyGraphStatus || "ready";
  const blockedReasons = Object.entries(evidence)
    .filter(([, status]) => status === "missing")
    .map(([name]) => `missing-${name}`);
  if (dependencyGraphStatus === "blocked") blockedReasons.push("dependency-graph-blocked");
  if (dependencyGraphStatus === "missing") blockedReasons.push("missing-dependency-graph");
  const base = {
    schemaVersion: "run-readiness-proof.v1" as const,
    proofId: `readiness-${input.bookRunId}-v${input.runVersion}`,
    bookRunId: input.bookRunId,
    projectSlug: input.projectSlug,
    runVersion: input.runVersion,
    scopeFingerprint: input.scopeFingerprint,
    status: blockedReasons.length ? "blocked" as const : "ready" as const,
    ...(dependencyGraphStatus !== "ready" ? { dependencyGraphStatus } : {}),
    evidence,
    blockedReasons,
    evaluatedAt: input.evaluatedAt || new Date().toISOString()
  };
  return { ...base, fingerprint: hash(base) };
}

export function assertRunReadinessProof(value: unknown, expectedProofId?: string): RunReadinessProof {
  if (!value || typeof value !== "object") throw new Error("RUN_READINESS_INTEGRITY_FAILED");
  const proof = value as Partial<RunReadinessProof>;
  const { fingerprint: _fingerprint, ...base } = proof as RunReadinessProof;
  const evidenceValues = proof.evidence && typeof proof.evidence === "object" ? Object.values(proof.evidence) : [];
  const validEvidence = evidenceValues.length === 5 && evidenceValues.every((item) => item === "present" || item === "missing");
  const dependencyGraphStatus = proof.dependencyGraphStatus || "ready";
  const validDependencyGraphStatus = ["ready", "blocked", "missing"].includes(dependencyGraphStatus);
  const dependencyGraphReasons = dependencyGraphStatus === "blocked" ? ["dependency-graph-blocked"] : dependencyGraphStatus === "missing" ? ["missing-dependency-graph"] : [];
  const expectedReasons = validEvidence
    ? [...Object.entries(proof.evidence as RunReadinessProof["evidence"]).filter(([, status]) => status === "missing").map(([name]) => `missing-${name}`), ...dependencyGraphReasons]
    : [];
  if (
    proof.schemaVersion !== "run-readiness-proof.v1" ||
    typeof proof.proofId !== "string" || !proof.proofId.trim() || (expectedProofId !== undefined && proof.proofId !== expectedProofId) ||
    typeof proof.bookRunId !== "string" || !proof.bookRunId.trim() ||
    typeof proof.projectSlug !== "string" || !proof.projectSlug.trim() ||
    !Number.isInteger(proof.runVersion) || (proof.runVersion as number) < 1 ||
    typeof proof.scopeFingerprint !== "string" || !/^[a-f0-9]{64}$/i.test(proof.scopeFingerprint) ||
    (proof.status !== "ready" && proof.status !== "blocked") ||
    !validEvidence ||
    !validDependencyGraphStatus ||
    !Array.isArray(proof.blockedReasons) || proof.blockedReasons.some((reason) => typeof reason !== "string") ||
    JSON.stringify(proof.blockedReasons) !== JSON.stringify(expectedReasons) ||
    (proof.status === "ready" && expectedReasons.length > 0) || (proof.status === "blocked" && expectedReasons.length === 0) ||
    typeof proof.evaluatedAt !== "string" || !Number.isFinite(Date.parse(proof.evaluatedAt)) ||
    typeof proof.fingerprint !== "string" || !/^[a-f0-9]{64}$/i.test(proof.fingerprint) || hash(base) !== proof.fingerprint
  ) throw new Error("RUN_READINESS_INTEGRITY_FAILED");
  return proof as RunReadinessProof;
}

export async function persistRunReadinessProof(root: string, proof: RunReadinessProof): Promise<RunReadinessProof> {
  assertRunReadinessProof(proof);
  const target = proofPath(root, proof.proofId);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(proof, null, 2)}\n`, "utf8");
  await fs.rename(temp, target);
  return proof;
}

export async function readRunReadinessProof(root: string, proofId: string): Promise<RunReadinessProof | null> {
  try {
    const value = JSON.parse(await fs.readFile(proofPath(root, proofId), "utf8")) as unknown;
    return assertRunReadinessProof(value, proofId);
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null;
    throw error;
  }
}
