import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import { readContractCandidate, type StoryContractCandidate } from "./contractCandidate.js";
import type { OutlineConfidence, OutlineConfidenceRole, OutlineDetailLevel } from "./outlineConfidence.js";

export interface OutlineChapterCandidate {
  semanticId: string;
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
  confidence: OutlineConfidence;
  role: OutlineConfidenceRole;
  detailLevel: OutlineDetailLevel;
  viewpoint?: string;
  timeMarker?: string;
  arcId?: string;
  arcReachable?: boolean;
  setupIds?: string[];
  payoffIds?: string[];
  obligationLoad?: number;
  changeEvidence?: string[];
  newRuleIds?: string[];
  foreshadowedRuleIds?: string[];
  growthStage?: number;
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

const chapterFunctionTitles: Record<OutlineChapterCandidate["function"], string> = {
  "inciting-pressure": "危机初现",
  complication: "冲突升级",
  reversal: "局势反转",
  choice: "关键抉择",
  aftermath: "余波与新局"
};

function outlinePath(root: string, outlineId: string): string {
  return resolveInside(root, `sessions/outline-candidates/${outlineId}.json`);
}

async function writeJson(target: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temp, target);
}

export function assertOutlineCandidateIntegrity(outline: OutlineCandidate, expectedId?: string): OutlineCandidate {
  const { fingerprint: _fingerprint, ...base } = outline;
  const functions = new Set(["inciting-pressure", "complication", "reversal", "choice", "aftermath"]);
  const chaptersValid = Array.isArray(outline.chapters) && outline.chapters.length > 0 && outline.chapters.every((chapter) => Boolean(chapter && typeof chapter.semanticId === "string" && chapter.semanticId.trim() && typeof chapter.chapterId === "string" && chapter.chapterId.trim() && Number.isInteger(chapter.order) && chapter.order > 0 && typeof chapter.title === "string" && chapter.title.trim() && functions.has(chapter.function) && typeof chapter.goal === "string" && chapter.goal.trim() && typeof chapter.conflict === "string" && chapter.conflict.trim() && typeof chapter.turningPoint === "string" && chapter.turningPoint.trim() && Array.isArray(chapter.causalInputs) && chapter.causalInputs.every((item) => typeof item === "string" && item.trim()) && Array.isArray(chapter.causalOutputs) && chapter.causalOutputs.every((item) => typeof item === "string" && item.trim()) && ["strong", "tentative"].includes(chapter.freeze) && ["committed", "rolling", "tentative"].includes(chapter.confidence) && ["book-milestone", "chapter-detail", "scene-level"].includes(chapter.role) && ["milestone", "detailed", "sketch"].includes(chapter.detailLevel) && chapter.status === "candidate"));
  const valid = outline.schemaVersion === "outline-candidate.v1" && (!expectedId || outline.outlineId === expectedId) && Boolean(outline.outlineId?.trim() && outline.projectSlug?.trim() && outline.sourceCandidateId?.trim() && outline.sourceCandidateFingerprint?.trim()) && (outline.status === "candidate" || outline.status === "stale") && Number.isInteger(outline.horizon?.strongFreezeCount) && Number.isInteger(outline.horizon?.totalChapterCount) && outline.horizon.strongFreezeCount >= 3 && outline.horizon.strongFreezeCount <= outline.horizon.totalChapterCount && outline.horizon.totalChapterCount === outline.chapters.length && chaptersValid && Array.isArray(outline.assumptions) && outline.assumptions.every((item) => typeof item === "string") && Array.isArray(outline.unknowns) && outline.unknowns.every((item) => typeof item === "string") && outline.canonWritten === false && typeof outline.createdAt === "string" && Number.isFinite(Date.parse(outline.createdAt)) && /^[a-f0-9]{64}$/i.test(outline.fingerprint) && crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex") === outline.fingerprint;
  if (!valid) throw new Error("OUTLINE_CANDIDATE_INTEGRITY_FAILED");
  return outline;
}

export async function readOutlineCandidate(root: string, outlineId: string): Promise<OutlineCandidate | null> {
  try {
    return assertOutlineCandidateIntegrity(JSON.parse(await fs.readFile(outlinePath(root, outlineId), "utf8")) as OutlineCandidate, outlineId);
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null;
    throw error;
  }
}

/** Read only the immutable source fingerprint for readiness binding.
 * Full candidate consumers must use readOutlineCandidate, which validates semantics. */
export async function readOutlineCandidateFingerprint(root: string, outlineId: string): Promise<string | null> {
  try {
    const value = JSON.parse(await fs.readFile(outlinePath(root, outlineId), "utf8")) as { fingerprint?: unknown };
    return typeof value.fingerprint === "string" && value.fingerprint.trim() ? value.fingerprint : null;
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
  const desire = source.contract.protagonist.primaryDesire || "主角必须确认自己愿意承担的风险。";
  const conflict = value(source, "conflict.core") || "外部压力迫使主角面对无法继续拖延的抉择。";
  const failureCost = value(source, "stakes.failureCost") || "一旦失败，将付出尚未解决的代价。";
  const ending = value(source, "endingDirection") || "结局走向仍待作者确认。";
  const functions: OutlineChapterCandidate["function"][] = ["inciting-pressure", "complication", "reversal", "choice", "aftermath"];
  const chapters: OutlineChapterCandidate[] = functions.slice(0, totalChapterCount).map((chapterFunction, index) => {
    const order = index + 1;
    const previous = order === 1 ? "已确认的主角核心诉求" : `第 ${order - 1} 章结果`;
    const next = order === totalChapterCount ? "作者审阅结局走向" : `第 ${order} 章结果`;
    return {
      semanticId: `outline:${source.candidateId}:chapter:${order}`,
      chapterId: `chapter-${String(order).padStart(3, "0")}`,
      order,
      title: `第 ${order} 章：${chapterFunctionTitles[chapterFunction]}`,
      function: chapterFunction,
      goal: order === 1 ? desire : `在第 ${order - 1} 章结果的影响下，推进：${desire}`,
      conflict,
      turningPoint: order === totalChapterCount ? ending : `代价进一步逼近：${failureCost}`,
      causalInputs: [previous],
      causalOutputs: [next],
      freeze: order <= strongFreezeCount ? "strong" : "tentative",
      confidence: order <= strongFreezeCount ? "rolling" : "tentative",
      role: "chapter-detail",
      detailLevel: order <= strongFreezeCount ? "detailed" : "milestone",
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
    assumptions: ["章节功能仅为候选规划，不代表故事事实已被正式确认。"],
    unknowns: source.unknowns,
    canonWritten: false as const,
    createdAt: new Date().toISOString()
  };
  const outline: OutlineCandidate = { ...base, fingerprint: crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex") };
  await writeJson(outlinePath(root, outlineId), outline);
  return { outline, created: true };
}
