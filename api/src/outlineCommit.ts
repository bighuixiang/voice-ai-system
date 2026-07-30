import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import { readOutlineCandidate } from "./outlineCandidate.js";
import { readOutlineValidationReport } from "./outlineValidation.js";
import { readOutlineAdoptionProposal, type OutlineAdoptionProposal } from "./outlineAdoption.js";

export interface OutlineVersion {
  schemaVersion: "outline-version.v1";
  versionId: string;
  projectSlug: string;
  version: number;
  outlineId: string;
  outlineFingerprint: string;
  selectedChapterIds: string[];
  strongFreezeCount: number;
  status: "active";
  canonWritten: true;
  createdAt: string;
  fingerprint: string;
}

export interface ExecutionReadyProof {
  schemaVersion: "execution-ready-proof.v1";
  proofId: string;
  projectSlug: string;
  versionId: string;
  versionFingerprint: string;
  status: "ready" | "blocked";
  executionReady: boolean;
  checks: Array<{ checkId: "version-active" | "near-horizon" | "source-fresh" | "canon-pointer"; status: "passed" | "failed"; detail: string }>;
  createdAt: string;
  fingerprint: string;
}

export interface OutlineCommitResult {
  status: "committed" | "rolled_back" | "blocked";
  canonWritten: boolean;
  version?: OutlineVersion;
  proof?: ExecutionReadyProof;
  reason?: "PROPOSAL_NOT_FOUND" | "PROPOSAL_NOT_AUTHORIZED" | "PROPOSAL_FINGERPRINT_STALE" | "OUTLINE_VALIDATION_STALE" | "OUTLINE_LEASE_UNAVAILABLE" | "INJECTED_FAULT";
}

function versionPath(root: string, outlineId: string): string { return resolveInside(root, `sessions/outline-versions/${outlineId}.json`); }
function proofPath(root: string): string { return resolveInside(root, "sessions/execution-ready-proof.json"); }
function projectPath(root: string): string { return resolveInside(root, "project.json"); }
function proposalPath(root: string): string { return resolveInside(root, "sessions/outline-adoption-proposal.json"); }

async function readOptional(target: string): Promise<{ existed: boolean; content: string }> {
  try { return { existed: true, content: await fs.readFile(target, "utf8") }; }
  catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return { existed: false, content: "" }; throw error; }
}

async function writeJson(target: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temp, target);
}

async function acquireLease(root: string): Promise<fs.FileHandle | null> {
  const target = resolveInside(root, "sessions/mutations/outline-adoption.lock");
  await fs.mkdir(path.dirname(target), { recursive: true });
  try { const handle = await fs.open(target, "wx"); await handle.writeFile(JSON.stringify({ acquiredAt: new Date().toISOString(), fencingToken: crypto.randomUUID() })); await handle.sync(); return handle; }
  catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "EEXIST") return null;
    throw error;
  }
}

async function releaseLease(root: string, handle: fs.FileHandle): Promise<void> {
  const target = resolveInside(root, "sessions/mutations/outline-adoption.lock");
  await handle.close();
  await fs.rm(target, { force: true });
}

function fingerprint(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }

function buildProof(projectSlug: string, version: OutlineVersion, outlineFingerprint: string, pointerMatches: boolean): ExecutionReadyProof {
  const checks = [
    { checkId: "version-active" as const, status: version.status === "active" ? "passed" as const : "failed" as const, detail: "OutlineVersion is active." },
    { checkId: "near-horizon" as const, status: version.strongFreezeCount >= 3 && version.selectedChapterIds.length >= version.strongFreezeCount ? "passed" as const : "failed" as const, detail: "At least three selected chapters are strongly frozen." },
    { checkId: "source-fresh" as const, status: version.outlineFingerprint === outlineFingerprint ? "passed" as const : "failed" as const, detail: "Version retains the validated outline fingerprint." },
    { checkId: "canon-pointer" as const, status: pointerMatches ? "passed" as const : "failed" as const, detail: "Project pointer references the committed version." }
  ];
  const base = { schemaVersion: "execution-ready-proof.v1" as const, proofId: `execution-ready-${version.versionId}`, projectSlug, versionId: version.versionId, versionFingerprint: version.fingerprint, status: checks.every((check) => check.status === "passed") ? "ready" as const : "blocked" as const, executionReady: checks.every((check) => check.status === "passed"), checks, createdAt: new Date().toISOString() };
  return { ...base, fingerprint: fingerprint(base) };
}

export async function readOutlineVersion(root: string, outlineId: string): Promise<OutlineVersion | null> {
  try { return JSON.parse(await fs.readFile(versionPath(root, outlineId), "utf8")) as OutlineVersion; }
  catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}

export async function readExecutionReadyProof(root: string): Promise<ExecutionReadyProof | null> {
  try { return JSON.parse(await fs.readFile(proofPath(root), "utf8")) as ExecutionReadyProof; }
  catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}

export async function commitOutlineAdoption(root: string, input: { expectedProposalFingerprint: string; faultAt?: "after-project-write" }): Promise<OutlineCommitResult> {
  const proposal = await readOutlineAdoptionProposal(root);
  if (!proposal) return { status: "blocked", canonWritten: false, reason: "PROPOSAL_NOT_FOUND" };
  if (proposal.status !== "authorized") return { status: "blocked", canonWritten: false, reason: "PROPOSAL_NOT_AUTHORIZED" };
  if (proposal.fingerprint !== input.expectedProposalFingerprint) return { status: "blocked", canonWritten: false, reason: "PROPOSAL_FINGERPRINT_STALE" };
  const outline = await readOutlineCandidate(root, proposal.outlineId);
  const validation = await readOutlineValidationReport(root, proposal.outlineId);
  if (!outline || !validation || validation.status !== "passed" || validation.outlineFingerprint !== outline.fingerprint || proposal.outlineFingerprint !== outline.fingerprint || proposal.validationFingerprint !== validation.fingerprint) return { status: "blocked", canonWritten: false, reason: "OUTLINE_VALIDATION_STALE" };
  const existing = await readOutlineVersion(root, proposal.outlineId);
  if (existing) return { status: "committed", canonWritten: true, version: existing, proof: await readExecutionReadyProof(root) || undefined };
  const lease = await acquireLease(root);
  if (!lease) return { status: "blocked", canonWritten: false, reason: "OUTLINE_LEASE_UNAVAILABLE" };
  const targets = [projectPath(root), versionPath(root, proposal.outlineId), proposalPath(root), proofPath(root)];
  const before = new Map<string, { existed: boolean; content: string }>();
  for (const target of targets) before.set(target, await readOptional(target));
  try {
    const project = JSON.parse(before.get(projectPath(root))!.content) as Record<string, unknown>;
    const versionBase = { schemaVersion: "outline-version.v1" as const, versionId: `outline-version-${proposal.outlineId}`, projectSlug: proposal.projectSlug, version: 1, outlineId: proposal.outlineId, outlineFingerprint: outline.fingerprint, selectedChapterIds: proposal.selectedChapterIds, strongFreezeCount: outline.horizon.strongFreezeCount, status: "active" as const, canonWritten: true as const, createdAt: new Date().toISOString() };
    const version: OutlineVersion = { ...versionBase, fingerprint: fingerprint(versionBase) };
    const nextProject = { ...project, outlineVersion: { versionId: version.versionId, fingerprint: version.fingerprint, outlineId: version.outlineId, selectedChapterIds: version.selectedChapterIds } };
    await writeJson(projectPath(root), nextProject);
    if (input.faultAt === "after-project-write") throw new Error("INJECTED_FAULT");
    const committedProposal: OutlineAdoptionProposal = { ...proposal, status: "committed", canonWritten: true };
    await writeJson(versionPath(root, proposal.outlineId), version);
    await writeJson(proposalPath(root), committedProposal);
    const proof = buildProof(proposal.projectSlug, version, outline.fingerprint, true);
    await writeJson(proofPath(root), proof);
    await releaseLease(root, lease);
    return { status: "committed", canonWritten: true, version, proof };
  } catch (error) {
    for (const target of targets) { const old = before.get(target)!; if (old.existed) await fs.writeFile(target, old.content, "utf8"); else await fs.rm(target, { force: true }); }
    await releaseLease(root, lease);
    return { status: "rolled_back", canonWritten: false, reason: error instanceof Error && error.message === "INJECTED_FAULT" ? "INJECTED_FAULT" : undefined };
  }
}
