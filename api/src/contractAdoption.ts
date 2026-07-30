import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import { readContractCandidate, type StoryContractCandidate } from "./contractCandidate.js";
import { readUnderstandingReview } from "./understandingReview.js";
import { readWorldRuleContract } from "./worldRuleContract.js";

export type ContractFieldDecisionStatus = "accept" | "keep-provisional" | "reject" | "delegate";

export interface ContractFieldDecision {
  fieldId: string;
  status: ContractFieldDecisionStatus;
  reason?: string;
}

export interface ContractAdoptionProposal {
  schemaVersion: "story-contract-adoption-proposal.v1";
  proposalId: string;
  candidateId: string;
  worldRuleContractId?: string;
  candidateFingerprint: string;
  projectSlug: string;
  status: "ready_for_authorization" | "blocked" | "committed";
  fieldDecisions: ContractFieldDecision[];
  acceptedFields: StoryContractCandidate["fields"];
  unresolvedFieldIds: string[];
  reviewId: string;
  canonWritten: false | true;
  createdAt: string;
  fingerprint: string;
}

function proposalPath(root: string): string {
  return resolveInside(root, "sessions/story-contract-adoption-proposal.json");
}

async function writeProposal(root: string, proposal: ContractAdoptionProposal): Promise<void> {
  const target = proposalPath(root);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(proposal, null, 2)}\n`, "utf8");
  await fs.rename(temp, target);
}

export async function readContractAdoptionProposal(root: string): Promise<ContractAdoptionProposal | null> {
  try {
    return JSON.parse(await fs.readFile(proposalPath(root), "utf8")) as ContractAdoptionProposal;
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null;
    throw error;
  }
}

export async function createContractAdoptionProposal(
  root: string,
  input: { candidateId: string; expectedCandidateFingerprint: string; fieldDecisions: ContractFieldDecision[]; worldRuleContractId?: string }
): Promise<{ proposal: ContractAdoptionProposal | null; error?: "CANDIDATE_NOT_FOUND" | "CANDIDATE_STALE" | "CANDIDATE_FINGERPRINT_STALE" | "INDEPENDENT_REVIEW_REQUIRED" | "FIELD_DECISION_REQUIRED" | "WORLD_RULE_CONTRACT_NOT_FOUND" | "WORLD_RULE_CONTRACT_STALE" }> {
  const candidate = await readContractCandidate(root, input.candidateId);
  if (!candidate) return { proposal: null, error: "CANDIDATE_NOT_FOUND" };
  if (candidate.status !== "candidate") return { proposal: null, error: "CANDIDATE_STALE" };
  if (candidate.fingerprint !== input.expectedCandidateFingerprint) return { proposal: null, error: "CANDIDATE_FINGERPRINT_STALE" };
  if (input.worldRuleContractId) {
    const worldRule = await readWorldRuleContract(root, input.worldRuleContractId);
    if (!worldRule) return { proposal: null, error: "WORLD_RULE_CONTRACT_NOT_FOUND" };
    if (worldRule.sourceCandidateId !== candidate.candidateId || worldRule.sourceFingerprint !== candidate.fingerprint) return { proposal: null, error: "WORLD_RULE_CONTRACT_STALE" };
  }
  const review = await readUnderstandingReview(root);
  if (!review || review.status !== "passed" || review.snapshotFingerprint !== candidate.sourceFingerprint) return { proposal: null, error: "INDEPENDENT_REVIEW_REQUIRED" };
  const decisions = new Map(input.fieldDecisions.map((decision) => [decision.fieldId, decision]));
  if (candidate.fields.some((field) => !decisions.has(field.fieldId))) return { proposal: null, error: "FIELD_DECISION_REQUIRED" };
  const acceptedFields = candidate.fields.filter((field) => decisions.get(field.fieldId)?.status === "accept");
  const unresolvedFieldIds = candidate.fields.filter((field) => decisions.get(field.fieldId)?.status !== "accept").map((field) => field.fieldId);
  const base = {
    schemaVersion: "story-contract-adoption-proposal.v1" as const,
    proposalId: `contract-adoption-${candidate.candidateId}`,
    candidateId: candidate.candidateId,
    ...(input.worldRuleContractId ? { worldRuleContractId: input.worldRuleContractId } : {}),
    candidateFingerprint: candidate.fingerprint,
    projectSlug: candidate.projectSlug,
    status: acceptedFields.length > 0 ? "ready_for_authorization" as const : "blocked" as const,
    fieldDecisions: input.fieldDecisions,
    acceptedFields,
    unresolvedFieldIds,
    reviewId: review.reviewId,
    canonWritten: false as const,
    createdAt: new Date().toISOString()
  };
  const proposal: ContractAdoptionProposal = { ...base, fingerprint: crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex") };
  await writeProposal(root, proposal);
  return { proposal };
}
