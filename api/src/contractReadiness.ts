import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import { readContractCandidate } from "./contractCandidate.js";
import { readContractAdoptionProposal } from "./contractAdoption.js";
import { readUnderstandingReview } from "./understandingReview.js";
import { readContractProjectionFreshness } from "./contractProjectionRebuild.js";

export interface StoryContractReadinessProof {
  schemaVersion: "story-contract-readiness-proof.v1";
  proofId: string;
  projectSlug: string;
  status: "ready" | "partial" | "blocked";
  candidateId?: string;
  proposalId?: string;
  requiredFields: Array<{ path: "protagonist.primaryDesire" | "world.rules.primary"; status: "confirmed" | "missing" | "provisional"; evidenceCount: number }>;
  contractFields: Array<{ path: "protagonist.primaryDesire" | "protagonist.innerNeed" | "protagonist.misbelief" | "world.rules.primary" | "conflict.core" | "conflict.opposingPressure" | "stakes.failureCost" | "stakes.irreversibleChoice" | "readerPromise" | "endingDirection"; status: "confirmed" | "missing" | "provisional"; evidenceCount: number }>;
  unknowns: string[];
  blockingReasons: string[];
  projectionStatus: "current" | "stale" | "unknown";
  createdAt: string;
  fingerprint: string;
}

function proofPath(root: string): string {
  return resolveInside(root, "sessions/story-contract-readiness-proof.json");
}

async function writeProof(root: string, proof: StoryContractReadinessProof): Promise<void> {
  const target = proofPath(root);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(proof, null, 2)}\n`, "utf8");
  await fs.rename(temp, target);
}

export async function readStoryContractReadinessProof(root: string): Promise<StoryContractReadinessProof | null> {
  try {
    return JSON.parse(await fs.readFile(proofPath(root), "utf8")) as StoryContractReadinessProof;
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null;
    throw error;
  }
}

export async function buildStoryContractReadinessProof(root: string, projectSlug: string, candidateId?: string): Promise<StoryContractReadinessProof> {
  const proposal = await readContractAdoptionProposal(root);
  const selectedCandidateId = candidateId || proposal?.candidateId;
  const candidate = selectedCandidateId ? await readContractCandidate(root, selectedCandidateId) : null;
  const review = await readUnderstandingReview(root);
  const projection = await readContractProjectionFreshness(root, projectSlug);
  const requiredPaths: StoryContractReadinessProof["requiredFields"][number]["path"][] = ["protagonist.primaryDesire", "world.rules.primary"];
  const contractPaths: StoryContractReadinessProof["contractFields"][number]["path"][] = [
    "protagonist.primaryDesire", "protagonist.innerNeed", "protagonist.misbelief", "conflict.core", "conflict.opposingPressure",
    "stakes.failureCost", "stakes.irreversibleChoice", "world.rules.primary", "readerPromise", "endingDirection"
  ];
  const contractFields = contractPaths.map((fieldPath) => {
    const field = candidate?.fields.find((candidateField) => candidateField.path === fieldPath);
    return {
      path: fieldPath,
      status: field?.epistemicStatus === "explicit" && field.evidenceRefs.length > 0 ? "confirmed" as const : field ? "provisional" as const : "missing" as const,
      evidenceCount: field?.evidenceRefs.length || 0
    };
  });
  const requiredFields = requiredPaths.map((fieldPath) => {
    const field = proposal?.acceptedFields.find((candidateField) => candidateField.path === fieldPath);
    return {
      path: fieldPath,
      status: field?.epistemicStatus === "explicit" && field.evidenceRefs.length > 0 ? "confirmed" as const : field ? "provisional" as const : "missing" as const,
      evidenceCount: field?.evidenceRefs.length || 0
    };
  });
  const blockingReasons: string[] = [];
  if (!candidate) blockingReasons.push("CONTRACT_CANDIDATE_REQUIRED");
  if (!proposal || proposal.status !== "committed" || proposal.canonWritten !== true) blockingReasons.push("AUTHOR_AUTHORIZED_COMMIT_REQUIRED");
  if (!review || review.status !== "passed") blockingReasons.push("INDEPENDENT_REVIEW_REQUIRED");
  if (projection.status !== "current") blockingReasons.push(`PROJECTION_${projection.status.toUpperCase()}`);
  const missingOrProvisional = requiredFields.some((field) => field.status !== "confirmed");
  const status = blockingReasons.length > 0 ? "blocked" as const : missingOrProvisional ? "partial" as const : "ready" as const;
  const unknowns = candidate?.unknowns || ["primary desire", "primary world rule", "core conflict", "failure cost", "ending direction"];
  const base = {
    schemaVersion: "story-contract-readiness-proof.v1" as const,
    proofId: `story-contract-readiness-${projectSlug}-${Date.now()}`,
    projectSlug,
    status,
    ...(candidate ? { candidateId: candidate.candidateId } : {}),
    ...(proposal ? { proposalId: proposal.proposalId } : {}),
    requiredFields,
    contractFields,
    unknowns,
    blockingReasons,
    projectionStatus: projection.status,
    createdAt: new Date().toISOString()
  };
  const proof: StoryContractReadinessProof = { ...base, fingerprint: crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex") };
  await writeProof(root, proof);
  return proof;
}
