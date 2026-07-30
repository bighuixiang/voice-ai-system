import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import { readProseCandidate, type ProseCandidate } from "./proseCandidate.js";
import { validateAndPersistProseCandidate, type ProseValidationBundle } from "./proseValidation.js";

export interface RedBlueReview {
  schemaVersion: "red-blue-review.v1";
  reviewId: string;
  candidateId: string;
  candidateFingerprint: string;
  validationBundleFingerprint: string;
  status: "passed" | "blocked";
  redFindings: Array<{ findingId: string; severity: "hard" | "warning"; detail: string }>;
  blueStrengths: Array<{ strengthId: string; detail: string }>;
  commonGround: Array<{ claimId: string; detail: string; evidenceRefs: string[] }>;
  blueArgument: { claims: Array<{ claimId: string; detail: string; evidenceRefs: string[] }>; protectedStrengths: string[] };
  redArgument: { claims: Array<{ claimId: string; detail: string; evidenceRefs: string[] }>; counterevidenceRefs: string[]; falsifiers: string[] };
  verdict: "supports-adoption" | "blocks-adoption" | "evidence-insufficient";
  recommendation: "adopt" | "repair" | "request-evidence";
  reviewer: { kind: "independent-deterministic"; id: "red-blue-review-v1" };
  createdAt: string;
  fingerprint: string;
}

function reviewPath(root: string, candidateId: string): string { return resolveInside(root, `sessions/prose-reviews/${candidateId}.json`); }
function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
async function writeJson(target: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temp, target);
}

export async function readRedBlueReview(root: string, candidateId: string): Promise<RedBlueReview | null> {
  try { return JSON.parse(await fs.readFile(reviewPath(root, candidateId), "utf8")) as RedBlueReview; }
  catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}

function inspectRedFindings(candidate: ProseCandidate): RedBlueReview["redFindings"] {
  const findings: RedBlueReview["redFindings"] = [];
  if (/\bTODO\b|\[REDACTED\]|<generated>/i.test(candidate.content)) findings.push({ findingId: "placeholder-or-wrapper", severity: "hard", detail: "Candidate contains an unresolved placeholder or generation wrapper." });
  if (/```/.test(candidate.content)) findings.push({ findingId: "fenced-output", severity: "warning", detail: "Candidate contains a prompt/output fence that requires author review." });
  return findings;
}

export async function reviewProseCandidate(root: string, candidate: ProseCandidate, validationBundle?: ProseValidationBundle): Promise<RedBlueReview> {
  const validation = validationBundle || await validateAndPersistProseCandidate(root, candidate);
  const redFindings = validation.status === "passed" ? inspectRedFindings(candidate) : validation.hardFailures.map((findingId) => ({ findingId, severity: "hard" as const, detail: "Validation bundle hard failure." }));
  const blueStrengths = candidate.content.trim() ? [{ strengthId: "non-empty-candidate", detail: "Candidate preserves a non-empty prose candidate for author comparison." }] : [];
  const commonGround = [
    { claimId: "candidate-bound", detail: "Both sides inspect the same immutable candidate and validation bundle.", evidenceRefs: [`candidate://${candidate.candidateId}`, `validation://${validation.bundleId}`] },
    { claimId: "context-bound", detail: "The candidate is evaluated against its frozen context rather than a regenerated prompt.", evidenceRefs: [`candidate-context://${candidate.generation.contextManifestId}`] }
  ];
  const blueArgument = {
    claims: blueStrengths.map((strength) => ({ claimId: strength.strengthId, detail: strength.detail, evidenceRefs: [`candidate://${candidate.candidateId}`] })),
    protectedStrengths: blueStrengths.map((strength) => strength.strengthId)
  };
  const redArgument = {
    claims: redFindings.map((finding) => ({ claimId: finding.findingId, detail: finding.detail, evidenceRefs: [`validation://${validation.bundleId}`] })),
    counterevidenceRefs: redFindings.map((finding) => `finding://${finding.findingId}`),
    falsifiers: ["A current validation bundle must fail or become stale.", "A protected blue strength must be contradicted by a reproducible candidate diff."]
  };
  const verdict = redFindings.some((finding) => finding.severity === "hard") ? "blocks-adoption" as const : blueStrengths.length ? "supports-adoption" as const : "evidence-insufficient" as const;
  const base = {
    schemaVersion: "red-blue-review.v1" as const,
    reviewId: `review-${candidate.candidateId}`,
    candidateId: candidate.candidateId,
    candidateFingerprint: candidate.fingerprint,
    validationBundleFingerprint: validation.fingerprint,
    status: redFindings.some((finding) => finding.severity === "hard") ? "blocked" as const : "passed" as const,
    redFindings,
    blueStrengths,
    commonGround,
    blueArgument,
    redArgument,
    verdict,
    recommendation: verdict === "blocks-adoption" ? "repair" as const : verdict === "supports-adoption" ? "adopt" as const : "request-evidence" as const,
    reviewer: { kind: "independent-deterministic" as const, id: "red-blue-review-v1" as const },
    createdAt: new Date().toISOString()
  };
  const review: RedBlueReview = { ...base, fingerprint: hash(base) };
  await writeJson(reviewPath(root, candidate.candidateId), review);
  return review;
}

export async function reviewProseCandidateById(root: string, candidateId: string): Promise<RedBlueReview> {
  const candidate = await readProseCandidate(root, candidateId);
  if (!candidate) throw new Error("PROSE_CANDIDATE_NOT_FOUND");
  return reviewProseCandidate(root, candidate);
}
