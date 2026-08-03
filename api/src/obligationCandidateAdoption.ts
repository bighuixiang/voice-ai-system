import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import { createNarrativeObligation, readNarrativeObligation, type NarrativeObligation, type ObligationType } from "./narrativeObligation.js";
import type { NarrativeObligationCandidate } from "./obligationCandidates.js";

interface AdoptionReceipt {
  schemaVersion: "narrative-obligation-candidate-adoption.v1";
  candidateId: string;
  obligationId: string;
  authorizationId: string;
  evidenceRefs: string[];
  fingerprint: string;
}

function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function isTraceable(reference: string): boolean { return /^[a-z][a-z0-9+.-]*:\/\/[^\s]+$/i.test(reference.trim()); }
function receiptPath(root: string, candidateId: string): string { return resolveInside(root, `sessions/obligations/candidates/${candidateId}.json`); }

export async function adoptNarrativeObligationCandidate(root: string, input: {
  projectSlug: string;
  candidate: NarrativeObligationCandidate;
  type?: ObligationType;
  title: string;
  questionOrPromise: string;
  importance?: "low" | "medium" | "high";
  authorizationId: string;
  expectedCandidateFingerprint: string;
  evidenceRefs: string[];
}): Promise<{ created: boolean; obligation: NarrativeObligation; receipt: AdoptionReceipt }> {
  if (input.candidate.status !== "candidate") throw new Error("OBLIGATION_CANDIDATE_NOT_ADOPTABLE");
  if (!input.authorizationId.trim()) throw new Error("OBLIGATION_CANDIDATE_AUTHORIZATION_REQUIRED");
  if (!input.evidenceRefs.length || input.evidenceRefs.some((reference) => !isTraceable(reference))) throw new Error("OBLIGATION_CANDIDATE_EVIDENCE_REQUIRED");
  if (!input.expectedCandidateFingerprint.trim()) throw new Error("OBLIGATION_CANDIDATE_FINGERPRINT_REQUIRED");
  if (input.expectedCandidateFingerprint !== input.candidate.fingerprint) throw new Error("OBLIGATION_CANDIDATE_STALE");
  if (!input.candidate.sourceRefs.length) throw new Error("OBLIGATION_CANDIDATE_SOURCES_REQUIRED");
  const target = receiptPath(root, input.candidate.candidateId);
  try {
    const receipt = JSON.parse(await fs.readFile(target, "utf8")) as AdoptionReceipt;
    const obligation = await readNarrativeObligation(root, receipt.obligationId);
    if (!obligation) throw new Error("OBLIGATION_CANDIDATE_RECEIPT_ORPHANED");
    return { created: false, obligation, receipt };
  } catch (error) {
    if (!(error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT")) throw error;
  }
  if (input.candidate.existingObligationId) {
    const obligation = await readNarrativeObligation(root, input.candidate.existingObligationId);
    if (!obligation) throw new Error("OBLIGATION_CANDIDATE_EXISTING_ORPHANED");
    const receiptBase = { schemaVersion: "narrative-obligation-candidate-adoption.v1" as const, candidateId: input.candidate.candidateId, obligationId: obligation.obligationId, authorizationId: input.authorizationId.trim(), evidenceRefs: [...input.evidenceRefs] };
    const receipt: AdoptionReceipt = { ...receiptBase, fingerprint: hash(receiptBase) };
    await fs.mkdir(path.dirname(target), { recursive: true });
    const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
    await fs.writeFile(temp, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
    await fs.rename(temp, target);
    return { created: false, obligation, receipt };
  }
  const obligation = await createNarrativeObligation(root, { projectSlug: input.projectSlug, type: input.type || "general_foreshadowing", title: input.title, questionOrPromise: input.questionOrPromise, importance: input.importance, sourceRefs: input.candidate.sourceRefs });
  const receiptBase = { schemaVersion: "narrative-obligation-candidate-adoption.v1" as const, candidateId: input.candidate.candidateId, obligationId: obligation.obligationId, authorizationId: input.authorizationId.trim(), evidenceRefs: [...input.evidenceRefs] };
  const receipt: AdoptionReceipt = { ...receiptBase, fingerprint: hash(receiptBase) };
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  await fs.rename(temp, target);
  return { created: true, obligation, receipt };
}
