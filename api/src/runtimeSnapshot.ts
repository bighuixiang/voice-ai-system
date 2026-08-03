import fs from "node:fs/promises";
import crypto from "node:crypto";
import type {
  CraftBeat,
  CreationRuntimeSnapshot,
  CreationRuntimeStep,
  LedgerEntry,
  NarrativeDebtSignal,
  NovelProject,
  SceneCard,
  WritingRecapCandidate
} from "./types.js";
import { resolveInside } from "./pathSafety.js";
import { readChapterDashboard, readChapterQualityReport, readChapterSummary, readLedgerEntries, readSceneCards } from "./writingCockpit.js";
import { readKnowledgeIndex } from "./knowledgeIndex.js";

const ledgerKinds: LedgerEntry["kind"][] = ["foreshadowing", "continuity", "power", "character", "risk"];

function countDraftWords(content: string): number {
  return content.replace(/\s+/g, "").length;
}

function firstActiveStep(steps: CreationRuntimeStep[]): CreationRuntimeSnapshot["activeStepId"] {
  return steps.find((step) => step.status === "active")?.id || steps.find((step) => step.status === "waiting")?.id;
}

function snapshotFingerprint(input: Omit<CreationRuntimeSnapshot, "fingerprint" | "updatedAt">): string {
  return crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 16);
}

function chapterOrder(project: NovelProject, chapterId: string): number | undefined {
  const chapter = project.chapters.find((item) => item.id === chapterId);
  if (typeof chapter?.order === "number" && chapter.order > 0) return chapter.order;
  const index = project.chapters.findIndex((item) => item.id === chapterId);
  if (index >= 0) return index + 1;
  const digitMatch = `${chapterId} ${chapter?.title || ""}`.match(/(\d+)/);
  return digitMatch ? Number(digitMatch[1]) : undefined;
}

function isOverdueDebt(entry: LedgerEntry, currentOrder?: number): boolean {
  if (!entry.expectedResolutionChapterId || !currentOrder) return false;
  const expected = entry.expectedResolutionChapterId.match(/(\d+)/);
  return Boolean(expected && Number(expected[1]) <= currentOrder && entry.status !== "resolved");
}

function narrativeDebtSeverity(input: { debtCount: number; riskCount: number; openLoopCount: number; overdueCount: number }): NarrativeDebtSignal["severity"] {
  if (input.overdueCount > 0 || input.riskCount >= 2) return "blocked";
  if (input.debtCount > 0 || input.openLoopCount > 0 || input.riskCount > 0) return "watch";
  return "stable";
}

async function readTaskHistory(root: string): Promise<Array<{ type?: string; status?: string; inputSummary?: string; result?: { content?: string } }>> {
  let content = "";
  try {
    content = await fs.readFile(resolveInside(root, "tasks/history.jsonl"), "utf8");
  } catch {
    return [];
  }
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
}

async function readWritingRecaps(root: string): Promise<WritingRecapCandidate[]> {
  let content = "";
  try {
    content = await fs.readFile(resolveInside(root, "tasks/recaps.jsonl"), "utf8");
  } catch {
    return [];
  }
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as WritingRecapCandidate];
      } catch {
        return [];
      }
    });
}

function pendingPatchCount(recap: WritingRecapCandidate): number {
  const patchGroups = [
    recap.factPatches || [],
    recap.characterStatePatches || [],
    recap.ledgerPatches || [],
    recap.riskPatches || [],
    recap.emotionLedgerPatch?.wounds || [],
    recap.emotionLedgerPatch?.boons || [],
    recap.emotionLedgerPatch?.powerShifts || [],
    recap.emotionLedgerPatch?.openLoops || []
  ];
  const structuredCount = patchGroups.flat().filter((item) => !("status" in item) || item.status === "pending").length;
  return structuredCount + (recap.summaryPatch ? 1 : 0) + (recap.craftBeatPatches?.length || 0);
}

function recapAcceptanceId(recap: WritingRecapCandidate): string {
  return `${recap.chapterId}:${recap.createdAt}`;
}

function sceneCraftBeats(scene: SceneCard): CraftBeat[] {
  const beats = [...(scene.craftBeats || [])];
  if (scene.readerPayoff?.trim()) {
    beats.push({
      id: `${scene.id}:reader-payoff`,
      type: "payoff",
      label: scene.readerPayoff,
      status: "planned"
    });
  }
  if (scene.progressionChange?.trim() || scene.powerProgression?.trim()) {
    beats.push({
      id: `${scene.id}:progression`,
      type: "progression",
      label: scene.progressionChange || scene.powerProgression || "Progression",
      status: "planned"
    });
  }
  for (const foreshadowingId of scene.foreshadowingIds || []) {
    beats.push({
      id: `${scene.id}:foreshadowing:${foreshadowingId}`,
      type: "foreshadow_setup",
      label: foreshadowingId,
      status: "planned"
    });
  }
  if (/daily|slice|日常/i.test(scene.narrativeFunction || "")) {
    beats.push({
      id: `${scene.id}:slice-of-life`,
      type: "slice_of_life",
      label: scene.narrativeFunction || "Slice of life",
      status: "planned"
    });
  }
  return [...new Map(beats.map((beat) => [beat.id, beat])).values()];
}

function buildCraftGateRisks(report: Awaited<ReturnType<typeof readChapterQualityReport>>, scenes: SceneCard[]): string[] {
  const craftMetricKeys = new Set(["character_arc", "payoff", "foreshadowing_health", "progression", "slice_of_life", "redemption"]);
  const risks =
    report?.metrics
      .filter((metric) => craftMetricKeys.has(metric.key) && metric.score < 70)
      .map((metric) => `${metric.label || metric.key}:${metric.score}`)
      .slice(0, 6) || [];
  const plannedBeats = scenes.flatMap(sceneCraftBeats);
  const missedRequired = plannedBeats.filter((beat) => beat.required && beat.status === "missed");
  if (!plannedBeats.length && scenes.length) risks.push("missing_scene_craft_beats");
  if (missedRequired.length) risks.push(`missed_required_craft_beats:${missedRequired.length}`);
  return risks;
}

export async function buildCreationRuntimeSnapshot(
  root: string,
  project: NovelProject,
  chapterId: string
): Promise<CreationRuntimeSnapshot> {
  const chapter = project.chapters.find((item) => item.id === chapterId) || project.chapters[0];
  if (!chapter) {
    throw new Error("Project has no chapters");
  }

  const [content, dashboard, scenes, summary, qualityReport, history, recaps, ledgers, knowledge] = await Promise.all([
    fs.readFile(resolveInside(root, chapter.contentPath), "utf8").catch(() => ""),
    readChapterDashboard(root, chapter.id),
    readSceneCards(root, chapter.id),
    readChapterSummary(root, chapter.id),
    readChapterQualityReport(root, chapter.id),
    readTaskHistory(root),
    readWritingRecaps(root),
    Promise.all(ledgerKinds.map((kind) => readLedgerEntries(root, kind))).then((items) => items.flat()),
    readKnowledgeIndex(root, project)
  ]);

  const wordCount = countDraftWords(content);
  const hasDashboard = Boolean(dashboard.goal.trim() || dashboard.mainConflict.trim() || dashboard.endingHook.trim());
  const hasStructure = hasDashboard || scenes.length > 0;
  const hasDraft = wordCount >= 30;
  const hasQualityReport = Boolean(qualityReport);
  const hasChapterSummary = Boolean(summary.summary.trim() || summary.keyEvents.length || summary.acceptedRecapIds.length);
  const hasWritingRecap = history.some(
    (task) =>
      task.type === "writing.recap" &&
      task.status === "success" &&
      (`${task.inputSummary || ""} ${task.result?.content || ""}`).includes(chapter.id)
  ) || recaps.some((recap) => recap.chapterId === chapter.id);
  const acceptedLedgers = ledgers.filter((entry) => entry.chapterIds.includes(chapter.id));
  const hasLedger = acceptedLedgers.length > 0 || hasChapterSummary;
  const savedDraftBlocked = !hasDraft;
  const currentOrder = chapterOrder(project, chapter.id);
  const unresolvedDebts = ledgers.filter(
    (entry) => entry.status !== "resolved" && (entry.chapterIds.includes(chapter.id) || isOverdueDebt(entry, currentOrder))
  );
  const openLoopCount = (summary.emotionLedger?.openLoops || []).filter((item) => item.status !== "resolved").length;
  const riskCount = unresolvedDebts.filter((entry) => entry.kind === "risk" || entry.kind === "continuity" || entry.status === "blocked").length;
  const overdueCount = unresolvedDebts.filter((entry) => isOverdueDebt(entry, currentOrder)).length;
  const narrativeDebt = {
    debtCount: unresolvedDebts.length + openLoopCount,
    openForeshadowingCount: unresolvedDebts.filter((entry) => entry.kind === "foreshadowing").length,
    riskCount,
    openLoopCount,
    overdueCount,
    severity: narrativeDebtSeverity({ debtCount: unresolvedDebts.length + openLoopCount, riskCount, openLoopCount, overdueCount })
  };
  const acceptedRecapIds = new Set(summary.acceptedRecapIds || []);
  const chapterRecaps = recaps.filter((recap) => recap.chapterId === chapter.id && !acceptedRecapIds.has(recapAcceptanceId(recap)));
  const pendingRecapPatchCount = chapterRecaps.reduce((total, recap) => total + pendingPatchCount(recap), 0);
  const craftBeatCount = scenes.reduce((total, scene) => total + sceneCraftBeats(scene).length, 0);
  const craftGateRisks = buildCraftGateRisks(qualityReport, scenes);

  const steps: CreationRuntimeStep[] = [
    {
      id: "structure",
      label: "结构",
      status: hasStructure ? "done" : "active",
      detail: hasStructure ? "章节仪表盘或场景卡已经形成写作约束" : "需要先形成章节目标、冲突或场景约束",
      metric: scenes.length ? `${scenes.length} 场` : dashboard.status
    },
    {
      id: "draft",
      label: "正文",
      status: hasDraft ? "done" : hasStructure ? "active" : "waiting",
      detail: hasDraft ? "正文已有可审稿内容" : "等待起草或保存正文",
      metric: `${wordCount} 字`
    },
    {
      id: "review",
      label: "审稿",
      status: hasQualityReport ? "done" : savedDraftBlocked ? "blocked" : "waiting",
      detail: hasQualityReport ? "已有章节质量报告" : savedDraftBlocked ? "需要先形成可审稿正文" : "等待质量体检",
      metric: hasQualityReport ? `${qualityReport?.overallScore || 0} 分` : "待体检"
    },
    {
      id: "recap",
      label: "章节复盘",
      status: hasChapterSummary || hasWritingRecap ? "done" : savedDraftBlocked ? "blocked" : "waiting",
      detail: hasChapterSummary || hasWritingRecap ? "已有章节复盘或摘要沉淀" : "等待抽取摘要、事实和状态变化",
      metric: hasChapterSummary ? "已沉淀" : hasWritingRecap ? "已生成" : "待生成"
    },
    {
      id: "ledger",
      label: "账本",
      status: hasLedger ? "done" : savedDraftBlocked ? "blocked" : "waiting",
      detail: hasLedger ? "当前章节已有账本或章节记忆沉淀" : "等待复盘确认后入账",
      metric: hasLedger ? `${acceptedLedgers.length} 条` : "待入账"
    },
    {
      id: "next",
      label: "下一章",
      status: hasLedger || hasWritingRecap ? "done" : "waiting",
      detail: hasLedger || hasWritingRecap ? "下一章可读取当前章节沉淀" : "完成复盘和入账后上下文更稳定",
      metric: chapter.status
    }
  ];

  const snapshotBase: Omit<CreationRuntimeSnapshot, "fingerprint" | "updatedAt"> = {
    projectSlug: project.slug,
    chapterId: chapter.id,
    chapterTitle: chapter.title,
    activeStepId: firstActiveStep(steps),
    steps,
    signals: {
      wordCount,
      sceneCount: scenes.length,
      hasDashboard,
      hasChapterSummary,
      hasQualityReport,
      hasWritingRecap,
      acceptedLedgerCount: acceptedLedgers.length,
      pendingRecapPatchCount,
      craftBeatCount,
      craftGateRisks,
      legacyFactCount: knowledge.facts.filter((fact) => fact.source.type !== "memory-claim").length,
      eligibleMemoryClaimCount: knowledge.facts.filter((fact) => fact.source.type === "memory-claim").length,
      projectionAuthority: knowledge.facts.some((fact) => fact.source.type === "memory-claim")
        ? knowledge.facts.some((fact) => fact.source.type !== "memory-claim") ? "mixed" : "memory-claim-backed"
        : "legacy-only",
      narrativeDebt
    }
  };

  return {
    ...snapshotBase,
    fingerprint: snapshotFingerprint(snapshotBase),
    updatedAt: new Date().toISOString()
  };
}
