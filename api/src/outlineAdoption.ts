import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import { readOutlineCandidate } from "./outlineCandidate.js";
import { readOutlineValidationReport } from "./outlineValidation.js";
import { readCandidateComparison } from "./candidateComparisonStore.js";

export interface OutlineAdoptionProposal {
  schemaVersion: "outline-adoption-proposal.v1";
  proposalId: string;
  projectSlug: string;
  outlineId: string;
  outlineFingerprint: string;
  validationReportId: string;
  validationFingerprint: string;
  adoptionMode: "whole" | "partial" | "fusion" | "reject";
  sourceCandidateIds: string[];
  comparisonFingerprint?: string;
  selectedChapterIds: string[];
  unadoptedChapterIds: string[];
  status: "ready_for_authorization" | "blocked" | "rejected" | "authorized" | "committed";
  authorAuthorization?: { actorId: string; authorizationId: string };
  canonWritten: false | true;
  createdAt: string;
  fingerprint: string;
}

function proposalPath(root: string): string {
  return resolveInside(root, "sessions/outline-adoption-proposal.json");
}

function proposalFingerprint(value: Omit<OutlineAdoptionProposal, "fingerprint">): string {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function writeJson(target: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temp, target);
}

export function assertOutlineAdoptionProposalIntegrity(proposal: OutlineAdoptionProposal): OutlineAdoptionProposal {
  const { fingerprint: _fingerprint, ...base } = proposal;
  const selected = proposal.selectedChapterIds;
  const unadopted = proposal.unadoptedChapterIds;
  const selectedValid = Array.isArray(selected) && selected.every((id) => typeof id === "string" && id.trim()) && new Set(selected).size === selected.length;
  const unadoptedValid = Array.isArray(unadopted) && unadopted.every((id) => typeof id === "string" && id.trim()) && new Set(unadopted).size === unadopted.length && !unadopted.some((id) => selected?.includes(id));
  const authorizationValid = proposal.authorAuthorization === undefined || Boolean(proposal.authorAuthorization.actorId?.trim() && proposal.authorAuthorization.authorizationId?.trim());
  const statusValid = (proposal.status === "authorized" && authorizationValid && proposal.authorAuthorization !== undefined && proposal.canonWritten === false) || (proposal.status === "committed" && authorizationValid && proposal.canonWritten === true) || ((proposal.status === "ready_for_authorization" || proposal.status === "blocked" || proposal.status === "rejected") && proposal.canonWritten === false);
  const valid = proposal.schemaVersion === "outline-adoption-proposal.v1" && Boolean(proposal.proposalId?.trim() && proposal.projectSlug?.trim() && proposal.outlineId?.trim() && proposal.outlineFingerprint?.trim() && proposal.validationReportId?.trim() && proposal.validationFingerprint?.trim()) && ["whole", "partial", "fusion", "reject"].includes(proposal.adoptionMode) && Array.isArray(proposal.sourceCandidateIds) && proposal.sourceCandidateIds.length > 0 && proposal.sourceCandidateIds.every((id) => typeof id === "string" && id.trim()) && (proposal.comparisonFingerprint === undefined || /^[a-f0-9]{64}$/i.test(proposal.comparisonFingerprint)) && selectedValid && unadoptedValid && ["ready_for_authorization", "blocked", "rejected", "authorized", "committed"].includes(proposal.status) && statusValid && typeof proposal.canonWritten === "boolean" && typeof proposal.createdAt === "string" && Number.isFinite(Date.parse(proposal.createdAt)) && /^[a-f0-9]{64}$/i.test(proposal.fingerprint) && crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex") === proposal.fingerprint;
  if (!valid) throw new Error("OUTLINE_ADOPTION_PROPOSAL_INTEGRITY_FAILED");
  return proposal;
}

export async function readOutlineAdoptionProposal(root: string): Promise<OutlineAdoptionProposal | null> {
  try { return assertOutlineAdoptionProposalIntegrity(JSON.parse(await fs.readFile(proposalPath(root), "utf8")) as OutlineAdoptionProposal); }
  catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null;
    throw error;
  }
}

export async function createOutlineAdoptionProposal(root: string, input: { outlineId: string; expectedOutlineFingerprint: string; adoptionMode?: "whole" | "partial" | "fusion" | "reject"; selectedChapterIds?: string[]; unadoptedChapterIds?: string[]; sourceCandidateIds?: string[]; comparisonFingerprint?: string }): Promise<OutlineAdoptionProposal> {
  const outline = await readOutlineCandidate(root, input.outlineId);
  if (!outline) throw new Error("OUTLINE_CANDIDATE_NOT_FOUND");
  if (outline.fingerprint !== input.expectedOutlineFingerprint) throw new Error("OUTLINE_FINGERPRINT_STALE");
  const validation = await readOutlineValidationReport(root, input.outlineId);
  if (!validation || validation.status !== "passed" || validation.outlineFingerprint !== outline.fingerprint) throw new Error("OUTLINE_VALIDATION_REQUIRED");
  const selectedInput = input.selectedChapterIds?.length ? [...new Set(input.selectedChapterIds)] : outline.chapters.map((chapter) => chapter.chapterId);
  const selectedChapterIds = input.adoptionMode === "reject" ? [] : selectedInput;
  const adoptionMode = input.adoptionMode ?? (selectedChapterIds.length === outline.chapters.length ? "whole" : "partial");
  if (selectedChapterIds.some((chapterId) => !outline.chapters.some((chapter) => chapter.chapterId === chapterId))) throw new Error("OUTLINE_CHAPTER_NOT_FOUND");
  const allChapterIds = outline.chapters.map((chapter) => chapter.chapterId);
  const expectedUnadoptedChapterIds = allChapterIds.filter((chapterId) => !selectedChapterIds.includes(chapterId));
  const unadoptedChapterIds = input.unadoptedChapterIds ? [...new Set(input.unadoptedChapterIds)] : expectedUnadoptedChapterIds;
  if (unadoptedChapterIds.some((chapterId) => !allChapterIds.includes(chapterId)) || JSON.stringify(unadoptedChapterIds) !== JSON.stringify(expectedUnadoptedChapterIds)) throw new Error("OUTLINE_UNADOPTED_PARTS_MISMATCH");
  if (adoptionMode === "whole" && unadoptedChapterIds.length) throw new Error("OUTLINE_ADOPTION_MODE_MISMATCH");
  if (adoptionMode === "partial" && (!selectedChapterIds.length || !unadoptedChapterIds.length)) throw new Error("OUTLINE_ADOPTION_MODE_MISMATCH");
  if (adoptionMode === "fusion" && !input.sourceCandidateIds?.length) throw new Error("OUTLINE_FUSION_SOURCES_REQUIRED");
  if (input.comparisonFingerprint) {
    const comparison = await readCandidateComparison(root, input.comparisonFingerprint, outline.projectSlug);
    if (!comparison) throw new Error("OUTLINE_COMPARISON_NOT_FOUND");
  }
  const sourceCandidateIds = [...new Set(input.sourceCandidateIds?.length ? input.sourceCandidateIds : [outline.sourceCandidateId])];
  const base = {
    schemaVersion: "outline-adoption-proposal.v1" as const,
    proposalId: `outline-adoption-${outline.outlineId}`,
    projectSlug: outline.projectSlug,
    outlineId: outline.outlineId,
    outlineFingerprint: outline.fingerprint,
    validationReportId: validation.reportId,
    validationFingerprint: validation.fingerprint,
    adoptionMode,
    sourceCandidateIds,
    ...(input.comparisonFingerprint ? { comparisonFingerprint: input.comparisonFingerprint } : {}),
    selectedChapterIds,
    unadoptedChapterIds,
    status: adoptionMode === "reject" ? "rejected" as const : "ready_for_authorization" as const,
    canonWritten: false as const,
    createdAt: new Date().toISOString()
  };
  const proposal: OutlineAdoptionProposal = { ...base, fingerprint: proposalFingerprint(base) };
  await writeJson(proposalPath(root), proposal);
  return proposal;
}

export async function authorizeOutlineAdoption(root: string, input: { expectedProposalFingerprint: string; authorization: { actorId: string; authorizationId: string } }): Promise<OutlineAdoptionProposal> {
  const proposal = await readOutlineAdoptionProposal(root);
  if (!proposal) throw new Error("OUTLINE_ADOPTION_PROPOSAL_NOT_FOUND");
  if (proposal.fingerprint !== input.expectedProposalFingerprint) throw new Error("OUTLINE_ADOPTION_FINGERPRINT_STALE");
  if (proposal.status !== "ready_for_authorization") throw new Error("OUTLINE_ADOPTION_NOT_READY");
  if (!input.authorization?.actorId?.trim() || !input.authorization?.authorizationId?.trim()) throw new Error("OUTLINE_ADOPTION_AUTHORIZATION_REQUIRED");
  const base = { ...proposal, status: "authorized" as const, authorAuthorization: input.authorization, createdAt: proposal.createdAt };
  const { fingerprint: _oldFingerprint, ...nextBase } = base;
  const next: OutlineAdoptionProposal = { ...nextBase, fingerprint: proposalFingerprint(nextBase) };
  await writeJson(proposalPath(root), next);
  return next;
}
