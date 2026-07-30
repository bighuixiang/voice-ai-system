import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import { readContractCandidate, type StoryContractCandidate } from "./contractCandidate.js";

export interface OutlineChapterCandidate {
  chapterId: string;
  order: number;
  title: string;
  function: "inciting-pressure" | "complication" | "reversal" | "choice" | "aftermath";
  goal: string;
  conflict: string;
  turningPoint: string;
  causalInputs: string[];
  causalOutputs: string[];
  freeze: "strong" | "tentative";
  status: "candidate";
}

export interface OutlineCandidate {
  schemaVersion: "outline-candidate.v1";
  outlineId: string;
  projectSlug: string;
  status: "candidate" | "stale";
  sourceCandidateId: string;
  sourceCandidateFingerprint: string;
  horizon: { strongFreezeCount: number; totalChapterCount: number };
  chapters: OutlineChapterCandidate[];
  assumptions: string[];
  unknowns: string[];
  canonWritten: false;
  createdAt: string;
  fingerprint: string;
}

interface OutlineCompileOptions { strongFreezeCount?: number; totalChapterCount?: number }

function outlinePath(root: string, outlineId: string): string {
  return resolveInside(root, `sessions/outline-candidates/${outlineId}.json`);
}

async function writeJson(target: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temp, target);
}

export async function readOutlineCandidate(root: string, outlineId: string): Promise<OutlineCandidate | null> {
  try {
    return JSON.parse(await fs.readFile(outlinePath(root, outlineId), "utf8")) as OutlineCandidate;
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null;
    throw error;
  }
}

export async function listOutlineCandidates(root: string): Promise<OutlineCandidate[]> {
  const directory = resolveInside(root, "sessions/outline-candidates");
  let names: string[];
  try { names = await fs.readdir(directory); } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return [];
    throw error;
  }
  return (await Promise.all(names.filter((name) => name.endsWith(".json")).map((name) => readOutlineCandidate(root, name.slice(0, -5))))).filter((candidate): candidate is OutlineCandidate => Boolean(candidate));
}

function value(candidate: StoryContractCandidate, pathName: keyof StoryContractCandidate["contract"] | "conflict.core" | "stakes.failureCost" | "endingDirection"): string | undefined {
  if (pathName === "conflict.core") return candidate.contract.conflict.core || undefined;
  if (pathName === "stakes.failureCost") return candidate.contract.stakes.failureCost || undefined;
  if (pathName === "endingDirection") return candidate.contract.endingDirection || undefined;
  return undefined;
}

export async function compileOutlineCandidate(root: string, sourceCandidateId: string, options: OutlineCompileOptions = {}): Promise<{ outline: OutlineCandidate; created: boolean }> {
  const source = await readContractCandidate(root, sourceCandidateId);
  if (!source) throw new Error("CONTRACT_CANDIDATE_NOT_FOUND");
  if (source.status !== "candidate") throw new Error("CONTRACT_CANDIDATE_STALE");
  const totalChapterCount = options.totalChapterCount ?? 5;
  const strongFreezeCount = options.strongFreezeCount ?? Math.min(3, totalChapterCount);
  if (!Number.isInteger(totalChapterCount) || totalChapterCount < 3 || totalChapterCount > 5) throw new Error("OUTLINE_HORIZON_INVALID");
  if (!Number.isInteger(strongFreezeCount) || strongFreezeCount < 3 || strongFreezeCount > totalChapterCount) throw new Error("OUTLINE_FREEZE_INVALID");
  const outlineId = `outline-candidate-${source.candidateId}`;
  const existing = await readOutlineCandidate(root, outlineId);
  if (existing) return { outline: existing, created: false };
  const desire = source.contract.protagonist.primaryDesire || "The protagonist must clarify what they are willing to risk.";
  const conflict = value(source, "conflict.core") || "Pressure exposes a choice the protagonist cannot postpone.";
  const failureCost = value(source, "stakes.failureCost") || "Failure carries an unresolved cost.";
  const ending = value(source, "endingDirection") || "The direction of the ending remains open pending author confirmation.";
  const functions: OutlineChapterCandidate["function"][] = ["inciting-pressure", "complication", "reversal", "choice", "aftermath"];
  const chapters: OutlineChapterCandidate[] = functions.slice(0, totalChapterCount).map((chapterFunction, index) => {
    const order = index + 1;
    const previous = order === 1 ? "confirmed contract desire" : `chapter-${String(order - 1).padStart(3, "0")} outcome`;
    const next = order === totalChapterCount ? "author review of ending direction" : `chapter-${String(order + 1).padStart(3, "0")} pressure`;
    return {
      chapterId: `chapter-${String(order).padStart(3, "0")}`,
      order,
      title: `${chapterFunction} candidate ${order}`,
      function: chapterFunction,
      goal: order === 1 ? desire : `${desire} under the consequences of chapter ${order - 1}`,
      conflict,
      turningPoint: order === totalChapterCount ? ending : `${failureCost} becomes harder to defer`,
      causalInputs: [previous],
      causalOutputs: [next],
      freeze: order <= strongFreezeCount ? "strong" : "tentative",
      status: "candidate"
    };
  });
  const base = {
    schemaVersion: "outline-candidate.v1" as const,
    outlineId,
    projectSlug: source.projectSlug,
    status: "candidate" as const,
    sourceCandidateId,
    sourceCandidateFingerprint: source.fingerprint,
    horizon: { strongFreezeCount, totalChapterCount },
    chapters,
    assumptions: ["Chapter functions are provisional and do not assert settled plot facts."],
    unknowns: source.unknowns,
    canonWritten: false as const,
    createdAt: new Date().toISOString()
  };
  const outline: OutlineCandidate = { ...base, fingerprint: crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex") };
  await writeJson(outlinePath(root, outlineId), outline);
  return { outline, created: true };
}
