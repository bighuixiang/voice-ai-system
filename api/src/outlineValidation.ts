import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import { readContractCandidate } from "./contractCandidate.js";
import { readOutlineCandidate, type OutlineCandidate } from "./outlineCandidate.js";
import { evaluateOutlineConfidence } from "./outlineConfidence.js";

export interface OutlineValidationCheck {
  checkId: "source-fingerprint" | "horizon" | "confidence-horizon" | "chapter-identity" | "chapter-functions" | "causal-chain" | "contract-anchor" | "canon-isolation" | "missing-beat" | "pov-time-conflict" | "unreachable-arc" | "setup-payoff-order" | "obligation-overload" | "no-change-chapter" | "unforeshadowed-climax" | "ending-new-rule" | "growth-span";
  status: "passed" | "failed";
  detail: string;
}

export interface OutlineValidationIssue {
  checkId: OutlineValidationCheck["checkId"];
  location: string;
  evidence: string[];
  severity: "warning" | "error";
  repairCandidate: string;
}

export interface OutlineValidationReport {
  schemaVersion: "outline-validation-report.v1";
  reportId: string;
  projectSlug: string;
  outlineId: string;
  outlineFingerprint: string;
  status: "passed" | "blocked";
  checks: OutlineValidationCheck[];
  issues: OutlineValidationIssue[];
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

export function assertOutlineValidationReportIntegrity(report: OutlineValidationReport, expectedId?: string): OutlineValidationReport {
  const { fingerprint: _fingerprint, ...base } = report;
  const checks = report.checks;
  const issues = report.issues;
  const checksValid = Array.isArray(checks) && checks.length > 0 && checks.every((item) => Boolean(item && typeof item.checkId === "string" && item.checkId.trim() && (item.status === "passed" || item.status === "failed") && typeof item.detail === "string" && item.detail.trim())) && new Set(checks.map((item) => item.checkId)).size === checks.length;
  const issuesValid = Array.isArray(issues) && issues.every((item) => Boolean(item && typeof item.checkId === "string" && item.checkId.trim() && typeof item.location === "string" && item.location.trim() && Array.isArray(item.evidence) && item.evidence.every((evidence) => typeof evidence === "string" && evidence.trim()) && (item.severity === "warning" || item.severity === "error") && typeof item.repairCandidate === "string" && item.repairCandidate.trim()));
  const expectedStatus = checksValid && checks.every((item) => item.status === "passed") ? "passed" : "blocked";
  const valid = report.schemaVersion === "outline-validation-report.v1" && (!expectedId || report.outlineId === expectedId) && Boolean(report.reportId?.trim() && report.projectSlug?.trim() && report.outlineId?.trim() && report.outlineFingerprint?.trim()) && (report.status === "passed" || report.status === "blocked") && report.status === expectedStatus && checksValid && issuesValid && report.executionReady === false && typeof report.createdAt === "string" && Number.isFinite(Date.parse(report.createdAt)) && /^[a-f0-9]{64}$/i.test(report.fingerprint) && crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex") === report.fingerprint;
  if (!valid) throw new Error("OUTLINE_VALIDATION_REPORT_INTEGRITY_FAILED");
  return report;
}

export async function readOutlineValidationReport(root: string, outlineId: string): Promise<OutlineValidationReport | null> {
  try { return assertOutlineValidationReportIntegrity(JSON.parse(await fs.readFile(reportPath(root, outlineId), "utf8")) as OutlineValidationReport, outlineId); }
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
  const issues: OutlineValidationIssue[] = [];
  const issue = (checkId: OutlineValidationIssue["checkId"], location: string, evidence: string[], repairCandidate: string, severity: OutlineValidationIssue["severity"] = "error") => {
    issues.push({ checkId, location, evidence, severity, repairCandidate });
    checks.push(check(checkId, false, repairCandidate));
  };
  checks.push(check("source-fingerprint", Boolean(source && source.status === "candidate" && source.fingerprint === outline.sourceCandidateFingerprint), "Outline must reference the current candidate fingerprint."));
  checks.push(check("horizon", outline.horizon.totalChapterCount >= 3 && outline.horizon.totalChapterCount <= 5 && outline.horizon.strongFreezeCount >= 3 && outline.horizon.strongFreezeCount <= outline.horizon.totalChapterCount && outline.chapters.length === outline.horizon.totalChapterCount, "The rolling horizon must contain 3-5 chapters and freeze at least the near horizon."));
  const confidenceFieldsPresent = outline.chapters.every((chapter) => Boolean(chapter.confidence && chapter.role && chapter.detailLevel));
  const confidenceReport = confidenceFieldsPresent ? evaluateOutlineConfidence({ totalChapterCount: outline.horizon.totalChapterCount, strongFreezeCount: outline.horizon.strongFreezeCount, nodes: outline.chapters.map((chapter) => ({ nodeId: chapter.chapterId, chapterOrder: chapter.order, confidence: chapter.confidence, role: chapter.role, detailLevel: chapter.detailLevel })) }) : null;
  checks.push(check("confidence-horizon", Boolean(confidenceReport?.status === "passed"), "Every outline node must declare a valid confidence horizon; near chapters are detailed and rolling while distant detail remains evolvable."));
  const chapterIds = outline.chapters.map((chapter) => chapter.chapterId);
  const semanticIds = outline.chapters.map((chapter) => chapter.semanticId);
  checks.push(check("chapter-identity", chapterIds.length === new Set(chapterIds).size && semanticIds.every(Boolean) && semanticIds.length === new Set(semanticIds).size && outline.chapters.every((chapter, index) => chapter.order === index + 1), "Semantic identities must be unique and separate from contiguous display order."));
  const functionOrder = ["inciting-pressure", "complication", "reversal", "choice", "aftermath"] as const;
  const functions = outline.chapters.map((chapter) => chapter.function);
  const chapterFunctions = functions.length >= 3
    && new Set(functions).size === functions.length
    && functions[0] === "inciting-pressure"
    && functions.every((chapterFunction, index) => functionOrder.indexOf(chapterFunction) === index);
  checks.push(check("chapter-functions", chapterFunctions, "The near horizon must use distinct chapter functions in causal order, beginning with inciting pressure."));
  const causalChain = outline.chapters.every((chapter, index) => {
    if (!chapter.causalInputs.length || !chapter.causalOutputs.length) return false;
    if (index === 0) return true;
    const previousOutputs = outline.chapters[index - 1].causalOutputs;
    return previousOutputs.some((output) => chapter.causalInputs.includes(output));
  });
  checks.push(check("causal-chain", causalChain, "Every chapter must consume at least one causal output from its predecessor and expose a consequence for the next node."));
  const desire = source?.contract.protagonist.primaryDesire;
  const conflict = source?.contract.conflict.core;
  const anchor = Boolean(source && desire && conflict && outline.chapters.every((chapter) => chapter.goal.includes(desire) && chapter.conflict === conflict));
  checks.push(check("contract-anchor", anchor, "Near-horizon goals and conflicts must remain anchored to the source contract."));
  checks.push(check("canon-isolation", outline.canonWritten === false && outline.status === "candidate", "Validation never establishes canon or execution readiness."));
  outline.chapters.forEach((chapter, index) => {
    const previous = index > 0 ? outline.chapters[index - 1] : undefined;
    if (!chapter.turningPoint.trim()) issue("missing-beat", chapter.chapterId, ["turningPoint is empty"], "补充该章的可验证落点，并标注其因果输出。");
    if (chapter.viewpoint && chapter.timeMarker && index > 0) {
      if (previous?.viewpoint === chapter.viewpoint && previous.timeMarker === chapter.timeMarker && chapter.causalInputs.length === 0) issue("pov-time-conflict", chapter.chapterId, ["same viewpoint/time marker without a causal entry"], "补充时间锚点或明确视角切换原因。");
    }
    if (chapter.arcId && chapter.arcReachable === false) issue("unreachable-arc", chapter.chapterId, [`arc:${chapter.arcId}`, "arcReachable=false"], "为该弧补充前置落点，或从当前大纲移除不可达弧。");
    if ((chapter.obligationLoad ?? 0) > 3) issue("obligation-overload", chapter.chapterId, [`obligationLoad=${chapter.obligationLoad}`], "拆分义务、延后回收或增加明确的承载章节。");
    if (index > 0) {
      const unchanged = previous && chapter.goal === previous.goal && chapter.conflict === previous.conflict && chapter.turningPoint === previous.turningPoint && JSON.stringify(chapter.causalInputs) === JSON.stringify(previous.causalInputs) && JSON.stringify(chapter.causalOutputs) === JSON.stringify(previous.causalOutputs);
      if (unchanged && !chapter.changeEvidence?.length) issue("no-change-chapter", chapter.chapterId, ["goal/conflict/turningPoint/causal edges unchanged from predecessor"], "增加状态变化或合并该章，不能以无变化章节占用冻结窗口。");
    }
    const setupIds = new Set(chapter.setupIds ?? []);
    const prematurePayoffs = (chapter.payoffIds ?? []).filter((id) => !outline.chapters.slice(0, index + 1).some((candidate) => (candidate.setupIds ?? []).includes(id)) && !setupIds.has(id));
    if (prematurePayoffs.length) issue("setup-payoff-order", chapter.chapterId, prematurePayoffs, "先安排对应铺垫，再移动回收点；禁止先回收后埋设。");
    if (index === outline.chapters.length - 1 && (chapter.newRuleIds ?? []).some((id) => !(chapter.foreshadowedRuleIds ?? []).includes(id))) issue("unforeshadowed-climax", chapter.chapterId, chapter.newRuleIds ?? [], "将结局规则提前铺垫并在前章留下可验证证据，或移除临时规则。");
    if (index === outline.chapters.length - 1 && (chapter.newRuleIds ?? []).length) issue("ending-new-rule", chapter.chapterId, chapter.newRuleIds ?? [], "结局不得临时引入新规则；改为使用已建立规则并补充回收链。");
    if (previous && chapter.growthStage !== undefined && previous.growthStage !== undefined && chapter.growthStage - previous.growthStage > 1) issue("growth-span", chapter.chapterId, [`growth ${previous.growthStage}->${chapter.growthStage}`], "拆分成长跨度，在中间章节提供可观察选择和代价。", "warning");
  });
  const setupIds = new Set(outline.chapters.flatMap((chapter) => chapter.setupIds ?? []));
  const payoffIds = outline.chapters.flatMap((chapter) => chapter.payoffIds ?? []);
  const missingSetup = payoffIds.filter((id) => !setupIds.has(id));
  if (missingSetup.length) issue("setup-payoff-order", "outline", missingSetup, "为每个回收点补充唯一铺垫，或将其标记为未决义务。");
  const base = {
    schemaVersion: "outline-validation-report.v1" as const,
    reportId: `outline-validation-${outline.outlineId}`,
    projectSlug: outline.projectSlug,
    outlineId: outline.outlineId,
    outlineFingerprint: outline.fingerprint,
    status: checks.every((item) => item.status === "passed") ? "passed" as const : "blocked" as const,
    checks,
    issues,
    executionReady: false as const,
    createdAt: new Date().toISOString()
  };
  const report: OutlineValidationReport = { ...base, fingerprint: crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex") };
  await writeJson(reportPath(root, outlineId), report);
  return report;
}
