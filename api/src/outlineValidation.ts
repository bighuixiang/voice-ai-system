import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import { readContractCandidate } from "./contractCandidate.js";
import { readOutlineCandidate, type OutlineCandidate } from "./outlineCandidate.js";

export interface OutlineValidationCheck {
  checkId: "source-fingerprint" | "horizon" | "chapter-identity" | "causal-chain" | "contract-anchor" | "canon-isolation";
  status: "passed" | "failed";
  detail: string;
}

export interface OutlineValidationReport {
  schemaVersion: "outline-validation-report.v1";
  reportId: string;
  projectSlug: string;
  outlineId: string;
  outlineFingerprint: string;
  status: "passed" | "blocked";
  checks: OutlineValidationCheck[];
  executionReady: false;
  createdAt: string;
  fingerprint: string;
}

function reportPath(root: string, outlineId: string): string {
  return resolveInside(root, `sessions/outline-validations/${outlineId}.json`);
}

async function writeJson(target: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temp, target);
}

export async function readOutlineValidationReport(root: string, outlineId: string): Promise<OutlineValidationReport | null> {
  try { return JSON.parse(await fs.readFile(reportPath(root, outlineId), "utf8")) as OutlineValidationReport; }
  catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null;
    throw error;
  }
}

function check(checkId: OutlineValidationCheck["checkId"], passed: boolean, detail: string): OutlineValidationCheck {
  return { checkId, status: passed ? "passed" : "failed", detail };
}

export async function validateOutlineCandidate(root: string, outlineId: string): Promise<OutlineValidationReport | null> {
  const outline = await readOutlineCandidate(root, outlineId);
  if (!outline) return null;
  const source = await readContractCandidate(root, outline.sourceCandidateId);
  const checks: OutlineValidationCheck[] = [];
  checks.push(check("source-fingerprint", Boolean(source && source.status === "candidate" && source.fingerprint === outline.sourceCandidateFingerprint), "Outline must reference the current candidate fingerprint."));
  checks.push(check("horizon", outline.horizon.totalChapterCount >= 3 && outline.horizon.totalChapterCount <= 5 && outline.horizon.strongFreezeCount >= 3 && outline.horizon.strongFreezeCount <= outline.horizon.totalChapterCount && outline.chapters.length === outline.horizon.totalChapterCount, "The rolling horizon must contain 3-5 chapters and freeze at least the near horizon."));
  const chapterIds = outline.chapters.map((chapter) => chapter.chapterId);
  checks.push(check("chapter-identity", chapterIds.length === new Set(chapterIds).size && outline.chapters.every((chapter, index) => chapter.order === index + 1), "Chapter identities must be unique and contiguous."));
  const causalChain = outline.chapters.every((chapter, index) => chapter.causalInputs.length > 0 && chapter.causalOutputs.length > 0 && (index === 0 || chapter.causalInputs.includes(`chapter-${String(index).padStart(3, "0")} outcome`)));
  checks.push(check("causal-chain", causalChain, "Every chapter must expose causal inputs and outputs linked to its predecessor."));
  const desire = source?.contract.protagonist.primaryDesire;
  const conflict = source?.contract.conflict.core;
  const anchor = Boolean(source && desire && conflict && outline.chapters.every((chapter) => chapter.goal.includes(desire) && chapter.conflict === conflict));
  checks.push(check("contract-anchor", anchor, "Near-horizon goals and conflicts must remain anchored to the source contract."));
  checks.push(check("canon-isolation", outline.canonWritten === false && outline.status === "candidate", "Validation never establishes canon or execution readiness."));
  const base = {
    schemaVersion: "outline-validation-report.v1" as const,
    reportId: `outline-validation-${outline.outlineId}`,
    projectSlug: outline.projectSlug,
    outlineId: outline.outlineId,
    outlineFingerprint: outline.fingerprint,
    status: checks.every((item) => item.status === "passed") ? "passed" as const : "blocked" as const,
    checks,
    executionReady: false as const,
    createdAt: new Date().toISOString()
  };
  const report: OutlineValidationReport = { ...base, fingerprint: crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex") };
  await writeJson(reportPath(root, outlineId), report);
  return report;
}
