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
  committedMutationId?: string;
  committedAt?: string;
  fingerprint: string;
}

export function contractAdoptionProposalFingerprint(value: Omit<ContractAdoptionProposal, "fingerprint">): string {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function assertContractAdoptionProposalIntegrity(proposal: ContractAdoptionProposal): ContractAdoptionProposal {
  const { fingerprint: _fingerprint, ...base } = proposal;
  const statuses: ContractFieldDecisionStatus[] = ["accept", "keep-provisional", "reject", "delegate"];
  const fieldsValid = Array.isArray(proposal.acceptedFields) && proposal.acceptedFields.every((field) => Boolean(
    field && typeof field.fieldId === "string" && field.fieldId.trim() && typeof field.path === "string" && field.path.trim()
      && typeof field.value === "string" && typeof field.epistemicStatus === "string" && Array.isArray(field.evidenceRefs)
      && field.evidenceRefs.length > 0 && field.evidenceRefs.every((ref) => typeof ref?.kind === "string" && ref.kind.trim() && typeof ref.refId === "string" && ref.refId.trim())
      && typeof field.sourceDecisionId === "string" && field.sourceDecisionId.trim() && typeof field.lock === "string" && field.lock.trim()
  ));
  const decisionsValid = Array.isArray(proposal.fieldDecisions) && proposal.fieldDecisions.length > 0 && proposal.fieldDecisions.every((decision) =>
    Boolean(decision && typeof decision.fieldId === "string" && decision.fieldId.trim() && statuses.includes(decision.status)
      && (decision.reason === undefined || typeof decision.reason === "string"))
  );
  const unresolvedValid = Array.isArray(proposal.unresolvedFieldIds) && proposal.unresolvedFieldIds.every((fieldId) => typeof fieldId === "string" && fieldId.trim()) && new Set(proposal.unresolvedFieldIds).size === proposal.unresolvedFieldIds.length;
  const committed = proposal.status === "committed";
  const commitmentValid = committed
    ? proposal.canonWritten === true && typeof proposal.committedMutationId === "string" && proposal.committedMutationId.trim() && typeof proposal.committedAt === "string" && Number.isFinite(Date.parse(proposal.committedAt))
    : proposal.canonWritten === false && proposal.committedMutationId === undefined && proposal.committedAt === undefined;
  const valid = proposal.schemaVersion === "story-contract-adoption-proposal.v1"
    && [proposal.proposalId, proposal.candidateId, proposal.projectSlug, proposal.reviewId].every((value) => typeof value === "string" && value.trim())
    && typeof proposal.candidateFingerprint === "string" && /^[a-f0-9]{64}$/i.test(proposal.candidateFingerprint)
    && (proposal.worldRuleContractId === undefined || (typeof proposal.worldRuleContractId === "string" && Boolean(proposal.worldRuleContractId.trim())))
    && ["ready_for_authorization", "blocked", "committed"].includes(proposal.status)
    && decisionsValid && fieldsValid && unresolvedValid
    && (proposal.status === "blocked" || proposal.acceptedFields.length > 0)
    && typeof proposal.createdAt === "string" && Number.isFinite(Date.parse(proposal.createdAt))
    && /^[a-f0-9]{64}$/i.test(proposal.fingerprint)
    && commitmentValid
    && contractAdoptionProposalFingerprint(base) === proposal.fingerprint;
  if (!valid) throw new Error("CONTRACT_ADOPTION_PROPOSAL_INTEGRITY_FAILED");
  return proposal;
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
    return assertContractAdoptionProposalIntegrity(JSON.parse(await fs.readFile(proposalPath(root), "utf8")) as ContractAdoptionProposal);
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
  const proposal: ContractAdoptionProposal = { ...base, fingerprint: contractAdoptionProposalFingerprint(base) };
  await writeProposal(root, proposal);
  return { proposal };
}
