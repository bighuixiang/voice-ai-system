import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import { readOutlineCandidate } from "./outlineCandidate.js";
import { readOutlineValidationReport } from "./outlineValidation.js";

export interface OutlineAdoptionProposal {
  schemaVersion: "outline-adoption-proposal.v1";
  proposalId: string;
  projectSlug: string;
  outlineId: string;
  outlineFingerprint: string;
  validationReportId: string;
  validationFingerprint: string;
  selectedChapterIds: string[];
  status: "ready_for_authorization" | "blocked" | "authorized" | "committed";
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

export async function readOutlineAdoptionProposal(root: string): Promise<OutlineAdoptionProposal | null> {
  try { return JSON.parse(await fs.readFile(proposalPath(root), "utf8")) as OutlineAdoptionProposal; }
  catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null;
    throw error;
  }
}

export async function createOutlineAdoptionProposal(root: string, input: { outlineId: string; expectedOutlineFingerprint: string; selectedChapterIds?: string[] }): Promise<OutlineAdoptionProposal> {
  const outline = await readOutlineCandidate(root, input.outlineId);
  if (!outline) throw new Error("OUTLINE_CANDIDATE_NOT_FOUND");
  if (outline.fingerprint !== input.expectedOutlineFingerprint) throw new Error("OUTLINE_FINGERPRINT_STALE");
  const validation = await readOutlineValidationReport(root, input.outlineId);
  if (!validation || validation.status !== "passed" || validation.outlineFingerprint !== outline.fingerprint) throw new Error("OUTLINE_VALIDATION_REQUIRED");
  const selectedChapterIds = input.selectedChapterIds?.length ? [...new Set(input.selectedChapterIds)] : outline.chapters.map((chapter) => chapter.chapterId);
  if (selectedChapterIds.some((chapterId) => !outline.chapters.some((chapter) => chapter.chapterId === chapterId))) throw new Error("OUTLINE_CHAPTER_NOT_FOUND");
  const base = {
    schemaVersion: "outline-adoption-proposal.v1" as const,
    proposalId: `outline-adoption-${outline.outlineId}`,
    projectSlug: outline.projectSlug,
    outlineId: outline.outlineId,
    outlineFingerprint: outline.fingerprint,
    validationReportId: validation.reportId,
    validationFingerprint: validation.fingerprint,
    selectedChapterIds,
    status: "ready_for_authorization" as const,
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
  const base = { ...proposal, status: "authorized" as const, authorAuthorization: input.authorization, createdAt: proposal.createdAt };
  const { fingerprint: _oldFingerprint, ...nextBase } = base;
  const next: OutlineAdoptionProposal = { ...nextBase, fingerprint: proposalFingerprint(nextBase) };
  await writeJson(proposalPath(root), next);
  return next;
}
