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

export function assertRedBlueReviewIntegrity(review: RedBlueReview, candidateId?: string): RedBlueReview {
    const { fingerprint, ...base } = review;
    const refsValid = (values: unknown) => Array.isArray(values) && values.every((value) => typeof value === "string" && value.trim());
    const findingsValid = Array.isArray(review.redFindings) && review.redFindings.every((finding) => finding.findingId.trim() && ["hard", "warning"].includes(finding.severity) && finding.detail.trim());
    const strengthsValid = Array.isArray(review.blueStrengths) && review.blueStrengths.every((strength) => strength.strengthId.trim() && strength.detail.trim());
    const claimsValid = (argument: { claims: Array<{ claimId: string; detail: string; evidenceRefs: string[] }> }) => Array.isArray(argument?.claims) && argument.claims.every((claim) => claim.claimId.trim() && claim.detail.trim() && refsValid(claim.evidenceRefs));
    const valid = review.schemaVersion === "red-blue-review.v1" && (!candidateId || review.candidateId === candidateId) && review.candidateId.trim() && review.candidateFingerprint.trim() && review.validationBundleFingerprint.trim() && ["passed", "blocked"].includes(review.status) && findingsValid && strengthsValid && Array.isArray(review.commonGround) && review.commonGround.every((claim) => claim.claimId.trim() && claim.detail.trim() && refsValid(claim.evidenceRefs)) && claimsValid(review.blueArgument) && refsValid(review.blueArgument.protectedStrengths) && claimsValid(review.redArgument) && refsValid(review.redArgument.counterevidenceRefs) && refsValid(review.redArgument.falsifiers) && ["supports-adoption", "blocks-adoption", "evidence-insufficient"].includes(review.verdict) && ["adopt", "repair", "request-evidence"].includes(review.recommendation) && review.reviewer?.kind === "independent-deterministic" && review.reviewer.id === "red-blue-review-v1" && !Number.isNaN(Date.parse(review.createdAt)) && /^[a-f0-9]{64}$/i.test(review.fingerprint) && hash(base) === fingerprint;
    if (!valid) throw new Error("PROSE_REVIEW_INTEGRITY_FAILED");
    return review;
}

export async function readRedBlueReview(root: string, candidateId: string): Promise<RedBlueReview | null> {
  try {
    const review = JSON.parse(await fs.readFile(reviewPath(root, candidateId), "utf8")) as RedBlueReview;
    return assertRedBlueReviewIntegrity(review, candidateId);
  }
  catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}

export async function listRedBlueReviews(root: string): Promise<RedBlueReview[]> {
  const directory = resolveInside(root, "sessions/prose-reviews");
  const names = await fs.readdir(directory).catch(() => [] as string[]);
  const reviews: RedBlueReview[] = [];
  for (const name of names.filter((entry) => entry.endsWith(".json"))) {
    const review = await readRedBlueReview(root, name.slice(0, -5));
    if (review) reviews.push(review);
  }
  return reviews.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

function inspectRedFindings(candidate: ProseCandidate): RedBlueReview["redFindings"] {
  const findings: RedBlueReview["redFindings"] = [];
  if (/\bTODO\b|\[REDACTED\]|<generated>/i.test(candidate.content)) findings.push({ findingId: "placeholder-or-wrapper", severity: "hard", detail: "Candidate contains an unresolved placeholder or generation wrapper." });
  if (/```/.test(candidate.content)) findings.push({ findingId: "fenced-output", severity: "warning", detail: "Candidate contains a prompt/output fence that requires author review." });
  return findings;
}

export async function reviewProseCandidate(root: string, candidate: ProseCandidate, validationBundle?: ProseValidationBundle): Promise<RedBlueReview> {
  if (validationBundle && (validationBundle.candidateId !== candidate.candidateId || validationBundle.candidateFingerprint !== candidate.fingerprint)) throw new Error("PROSE_REVIEW_INPUT_MISMATCH");
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
