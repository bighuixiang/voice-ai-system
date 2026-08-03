import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import { readContextManifest } from "./contextManifest.js";
import { readProseCandidate, type ProseCandidate } from "./proseCandidate.js";
import { buildTextProfile, verifyTextRoundTrip } from "./textIntegrity.js";
import { evaluateAntiGoalGuard } from "./draftingGovernance.js";
import { readCurrentProseGenerationManifest, readProseGenerationManifest } from "./proseGenerationManifest.js";

export interface ProseValidationBundle {
  schemaVersion: "prose-validation-bundle.v1";
  bundleId: string;
  candidateId: string;
  candidateFingerprint: string;
  status: "passed" | "blocked";
  checks: Array<{ checkId: string; status: "passed" | "failed"; detail: string }>;
  hardFailures: string[];
  reviewer: { kind: "independent-deterministic"; id: "prose-validation-v1" };
  createdAt: string;
  fingerprint: string;
}

function validationPath(root: string, candidateId: string): string { return resolveInside(root, `sessions/prose-validations/${candidateId}.json`); }
function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }

async function writeJson(target: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temp, target);
}

export function assertProseValidationBundleIntegrity(bundle: ProseValidationBundle, candidateId?: string): ProseValidationBundle {
    const { fingerprint, ...base } = bundle;
    const checksValid = Array.isArray(bundle.checks) && bundle.checks.length > 0 && bundle.checks.every((check) => check.checkId.trim() && ["passed", "failed"].includes(check.status) && check.detail.trim());
    const failuresValid = Array.isArray(bundle.hardFailures) && bundle.hardFailures.every((failure) => typeof failure === "string" && failure.trim()) && bundle.hardFailures.every((failure) => bundle.checks.some((check) => check.checkId === failure && check.status === "failed"));
    const valid = bundle.schemaVersion === "prose-validation-bundle.v1" && (!candidateId || bundle.candidateId === candidateId) && [bundle.bundleId, bundle.candidateId, bundle.candidateFingerprint, bundle.createdAt].every((value) => typeof value === "string" && value.trim()) && checksValid && failuresValid && bundle.status === (bundle.hardFailures.length ? "blocked" : "passed") && bundle.reviewer?.kind === "independent-deterministic" && bundle.reviewer.id === "prose-validation-v1" && !Number.isNaN(Date.parse(bundle.createdAt)) && /^[a-f0-9]{64}$/i.test(bundle.fingerprint) && hash(base) === fingerprint;
    if (!valid) throw new Error("PROSE_VALIDATION_INTEGRITY_FAILED");
    return bundle;
}

export async function readProseValidationBundle(root: string, candidateId: string): Promise<ProseValidationBundle | null> {
  try {
    const bundle = JSON.parse(await fs.readFile(validationPath(root, candidateId), "utf8")) as ProseValidationBundle;
    return assertProseValidationBundleIntegrity(bundle, candidateId);
  }
  catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}

export async function validateAndPersistProseCandidate(root: string, candidate: ProseCandidate, options: { antiGoals?: Array<{ antiGoal: string; evidence: string; patterns: string[] }>; repairScope?: string[] } = {}): Promise<ProseValidationBundle> {
  const context = await readContextManifest(root, { allowLegacyExecutionMetadata: true });
  const boundManifest = candidate.generation.manifestId ? await readProseGenerationManifest(root, candidate.generation.manifestId) : null;
  const currentManifest = boundManifest && candidate.generation.chapterIntentRef ? await readCurrentProseGenerationManifest(root, candidate.generation.chapterIntentRef) : boundManifest;
  const generationManifestCurrent = !candidate.generation.manifestId || Boolean(boundManifest && currentManifest && boundManifest.fingerprint === candidate.generation.manifestFingerprint && boundManifest.decisionConsumptionReceiptRef === candidate.generation.decisionConsumptionReceiptRef && currentManifest.manifestId === boundManifest.manifestId && currentManifest.fingerprint === boundManifest.fingerprint);
  const textProof = verifyTextRoundTrip(candidate.content, buildTextProfile(candidate.content));
  const antiGoalGuard = options.antiGoals?.length ? evaluateAntiGoalGuard({ text: candidate.content, antiGoals: options.antiGoals, repairScope: options.repairScope || ["local-sentence"] }) : undefined;
  const checks = [
    { checkId: "content-non-empty", status: candidate.content.trim() ? "passed" as const : "failed" as const, detail: "Candidate contains prose content." },
    { checkId: "outline-version-bound", status: candidate.generation.outlineVersionId ? "passed" as const : "failed" as const, detail: "Candidate is bound to an outline version." },
    { checkId: "execution-proof-bound", status: candidate.generation.executionProofFingerprint ? "passed" as const : "failed" as const, detail: "Candidate is bound to an execution-ready proof." },
    { checkId: "context-current", status: context && context.manifestId === candidate.generation.contextManifestId && context.sourceFingerprint === candidate.generation.contextFingerprint ? "passed" as const : "failed" as const, detail: "Candidate context manifest must remain current." },
    { checkId: "generation-manifest-current", status: generationManifestCurrent ? "passed" as const : "failed" as const, detail: "Bound prose generation manifest must exist and remain the current chapter-intent manifest." },
    { checkId: "candidate-integrity", status: hash({ ...candidate, fingerprint: undefined }) === candidate.fingerprint ? "passed" as const : "failed" as const, detail: "Candidate fingerprint must reproduce from its immutable fields." },
    { checkId: "text-round-trip", status: textProof.status === "passed" ? "passed" as const : "failed" as const, detail: textProof.diagnostics.length ? textProof.diagnostics.join(",") : "TextProfile round trip preserves source bytes without silent normalization." },
    ...(antiGoalGuard ? [{ checkId: "anti-goal-guard", status: antiGoalGuard.status === "passed" ? "passed" as const : "failed" as const, detail: antiGoalGuard.hits.length ? antiGoalGuard.hits.map((hit) => `${hit.antiGoal}:${hit.evidence}`).join(",") : "No configured anti-goal pattern matched." }] : [])
  ];
  const hardFailures = checks.filter((check) => check.status === "failed").map((check) => check.checkId);
  const base = {
    schemaVersion: "prose-validation-bundle.v1" as const,
    bundleId: `validation-${candidate.candidateId}`,
    candidateId: candidate.candidateId,
    candidateFingerprint: candidate.fingerprint,
    status: hardFailures.length ? "blocked" as const : "passed" as const,
    checks,
    hardFailures,
    reviewer: { kind: "independent-deterministic" as const, id: "prose-validation-v1" as const },
    createdAt: new Date().toISOString()
  };
  const bundle: ProseValidationBundle = { ...base, fingerprint: hash(base) };
  await writeJson(validationPath(root, candidate.candidateId), bundle);
  return bundle;
}

export async function validateProseCandidateById(root: string, candidateId: string): Promise<ProseValidationBundle> {
  const candidate = await readProseCandidate(root, candidateId);
  if (!candidate) throw new Error("PROSE_CANDIDATE_NOT_FOUND");
  return validateAndPersistProseCandidate(root, candidate);
}
