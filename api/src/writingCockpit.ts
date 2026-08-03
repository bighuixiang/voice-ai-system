import fs from "node:fs/promises";
import path from "node:path";
import type {
  ChapterDashboard,
  ChapterFactPatch,
  ChapterQualityReport,
  ChapterSummary,
  CharacterArcSignal,
  CharacterStatePatch,
  CraftBeat,
  CraftCoverageSignal,
  EmotionLedger,
  EmotionLedgerItem,
  LedgerEntry,
  NarrativeDebtSignal,
  NovelProject,
  SceneCard,
  SeriesQualityMetricAverage,
  SeriesRhythmSignal,
  SeriesQualityTrend,
  SeriesTensionPoint,
  SeriesStyleDriftSignal,
  SeriesQualityMetrics,
  StoryControl,
  WritingRecapCandidate
} from "./types.js";
import { resolveInside } from "./pathSafety.js";

type LedgerKind = LedgerEntry["kind"];

const ledgerPaths: Record<LedgerKind, string> = {
  foreshadowing: "ledger/foreshadowing.json",
  continuity: "ledger/continuity.json",
  power: "ledger/power-progression.json",
  character: "ledger/character-state.json",
  risk: "ledger/risks.json"
};

function nowIso(): string {
  return new Date().toISOString();
}

function defaultDashboard(chapterId: string): ChapterDashboard {
  return {
    chapterId,
    goal: "",
    pov: "",
    mainConflict: "",
    endingHook: "",
    wordCount: 0,
    status: "empty",
    unresolvedForeshadowingIds: [],
    continuityRiskIds: [],
    updatedAt: nowIso()
  };
}

function defaultChapterSummary(chapterId: string): ChapterSummary {
  return {
    chapterId,
    summary: "",
    keyEvents: [],
    newFacts: [],
    characterStateChanges: [],
    emotionLedger: defaultEmotionLedger(),
    foreshadowingUpdates: [],
    continuityRisks: [],
    powerProgressionUpdates: [],
    acceptedRecapIds: [],
    updatedAt: nowIso()
  };
}

function defaultEmotionLedger(): EmotionLedger {
  return {
    wounds: [],
    boons: [],
    powerShifts: [],
    openLoops: []
  };
}

export function defaultStoryControl(): StoryControl {
  const now = nowIso();
  return {
    version: 1,
    premise: "",
    currentArcId: "arc-main-01",
    arcs: [
      {
        id: "arc-main-01",
        title: "主线起步",
        chapterRange: "第 1-10 章",
        goal: "明确主角处境、核心目标和第一轮外部压力。",
        stakes: "如果主角不行动，将失去当前最重要的资源或关系。",
        payoff: "主角完成第一次可信突破，并留下下一阶段更大的问题。",
        status: "seed",
        updatedAt: now
      }
    ],
    characters: [
      {
        id: "char-protagonist",
        name: "主角",
        role: "主角",
        goal: "补全长期目标和短期目标。",
        currentState: "初始状态待补充。",
        knownSecrets: "只记录当前章节前已经知道的信息。",
        relationshipNotes: "记录队友、竞争者、债主或师承关系。",
        powerLevel: "初始能力待补充。",
        signatureTraits: ["one concrete habit", "one pressure reaction", "one speech texture"],
        coreWound: "The private hurt or shame that makes this character overreact.",
        desire: "What the character wants in the next visible chapter window.",
        misbelief: "The wrong belief that creates repeated choices and eventual growth.",
        redemptionArc: "How the character may repair a mistake through costly action.",
        sublimationGoal: "How private desire can rise into duty, oath, or larger value.",
        smallPersonHighlight: "A concrete high-light moment where an ordinary person changes the scene.",
        relationshipPressure: "The relationship debt, rivalry, trust gap, or obligation pushing choices.",
        growthStage: "seed",
        status: "seed",
        updatedAt: now
      }
    ],
    events: [
      {
        id: "event-first-dungeon",
        type: "dungeon",
        title: "第一处特殊事件",
        trigger: "主角达到第一个小目标，但需要外部压力迫使他组队行动。",
        participants: ["主角"],
        location: "待定地点",
        conflict: "收益可观，但会暴露主角不该轻易暴露的信息。",
        reward: "能力、资源、关系或线索上的小突破。",
        cost: "留下代价、伤势、债务、敌意或更大的追踪风险。",
        foreshadowing: "提前 2-3 章埋入异常物件、传闻或地图碎片。",
        chapterRange: "待安排",
        readerPayoff: "Setup a visible payoff with pressure, cost, action, reward, and aftershock.",
        craftBeats: [
          {
            id: "craft-first-dungeon-payoff",
            type: "payoff",
            label: "first earned payoff",
            setup: "The protagonist lacks a resource or status.",
            payoff: "A small but irreversible gain changes future options.",
            cost: "The gain leaves debt, exposure, injury, or a stronger enemy.",
            required: true,
            status: "planned"
          }
        ],
        status: "seed",
        updatedAt: now
      }
    ],
    orchestrationNotes: "AI 编排未来章节时必须让事件由角色动机和代价触发，避免无因刷副本或突然升级。",
    updatedAt: now
  };
}

async function readJsonFile<T>(root: string, relativePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(resolveInside(root, relativePath), "utf8");
    return JSON.parse(raw) as T;
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

async function writeJsonFile(root: string, relativePath: string, value: unknown): Promise<void> {
  const target = resolveInside(root, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function jsonContent(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function readOptionalTextFile(root: string, relativePath: string): Promise<string | null> {
  try {
    return await fs.readFile(resolveInside(root, relativePath), "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function writeFilesTransaction(root: string, writes: Array<{ relativePath: string; content: string }>): Promise<void> {
  const txId = `tx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const prepared: Array<{ target: string; tmp: string; backup: string | null }> = [];
  const committed: Array<{ target: string; backup: string | null }> = [];

  try {
    for (const write of writes) {
      const target = resolveInside(root, write.relativePath);
      const tmp = `${target}.${txId}.tmp`;
      await fs.mkdir(path.dirname(target), { recursive: true });
      const backup = await readOptionalTextFile(root, write.relativePath);
      await fs.writeFile(tmp, write.content, "utf8");
      prepared.push({ target, tmp, backup });
    }

    for (const item of prepared) {
      await fs.rename(item.tmp, item.target);
      committed.push({ target: item.target, backup: item.backup });
    }
  } catch (error) {
    await Promise.allSettled(prepared.map((item) => fs.rm(item.tmp, { force: true })));
    for (const item of committed.reverse()) {
      if (item.backup === null) {
        await fs.rm(item.target, { force: true }).catch(() => undefined);
      } else {
        await fs.writeFile(item.target, item.backup, "utf8").catch(() => undefined);
      }
    }
    throw error;
  }
}

function chapterDashboardPath(chapterId: string): string {
  return `dashboard/${chapterId}.json`;
}

function sceneCardsPath(chapterId: string): string {
  return `scenes/${chapterId}.json`;
}

function chapterSummaryPath(chapterId: string): string {
  return `memory/chapter-summaries/${chapterId}.json`;
}

function chapterQualityPath(chapterId: string): string {
  return `quality/${chapterId}.json`;
}

function seriesQualityPath(): string {
  return "quality/series-metrics.json";
}

function storyControlPath(): string {
  return "story-control/story-control.json";
}

function ledgerPath(kind: LedgerKind): string {
  return ledgerPaths[kind];
}

function mergeById<T extends { id: string }>(existing: T[], updates: T[]): T[] {
  const merged = new Map(existing.map((item) => [item.id, item]));
  updates.forEach((item) => {
    merged.set(item.id, {
      ...merged.get(item.id),
      ...item
    });
  });
  return Array.from(merged.values());
}

function acceptedFactPatches(patches: ChapterFactPatch[]): ChapterFactPatch[] {
  return patches.map((patch) => ({
    ...patch,
    status: "accepted",
    updatedAt: nowIso()
  }));
}

function acceptedCharacterStatePatches(patches: CharacterStatePatch[]): CharacterStatePatch[] {
  return patches.map((patch) => ({
    ...patch,
    status: "accepted",
    updatedAt: nowIso()
  }));
}

function legacyFactPatches(recap: WritingRecapCandidate): ChapterFactPatch[] {
  return recap.newFacts.map((fact, index) => ({
    id: `fact-${recap.chapterId}-${Date.parse(recap.createdAt) || 0}-${index + 1}`,
    chapterId: recap.chapterId,
    fact,
    relatedEntities: [],
    status: "pending",
    createdAt: recap.createdAt,
    updatedAt: recap.createdAt
  }));
}

function legacyCharacterPatches(recap: WritingRecapCandidate): CharacterStatePatch[] {
  return recap.characterStateChanges.map((change, index) => ({
    id: `character-state-${recap.chapterId}-${Date.parse(recap.createdAt) || 0}-${index + 1}`,
    chapterId: recap.chapterId,
    characterName: "未指定角色",
    after: change,
    cause: recap.summary,
    relatedEntities: [],
    status: "pending",
    createdAt: recap.createdAt,
    updatedAt: recap.createdAt
  }));
}

function recapAcceptanceId(recap: WritingRecapCandidate): string {
  return `${recap.chapterId}:${recap.createdAt}`;
}

export async function readChapterDashboard(root: string, chapterId: string): Promise<ChapterDashboard> {
  return readJsonFile(root, chapterDashboardPath(chapterId), defaultDashboard(chapterId));
}

export async function saveChapterDashboard(root: string, dashboard: ChapterDashboard): Promise<ChapterDashboard> {
  const normalized = {
    ...dashboard,
    updatedAt: dashboard.updatedAt || nowIso()
  };
  await writeJsonFile(root, chapterDashboardPath(dashboard.chapterId), normalized);
  return normalized;
}

export async function readChapterSummary(root: string, chapterId: string): Promise<ChapterSummary> {
  return readJsonFile(root, chapterSummaryPath(chapterId), defaultChapterSummary(chapterId));
}

export async function saveChapterSummary(root: string, summary: ChapterSummary): Promise<ChapterSummary> {
  const normalized = normalizeChapterSummary(summary);
  await writeJsonFile(root, chapterSummaryPath(summary.chapterId), normalized);
  return normalized;
}

function normalizeChapterSummary(summary: ChapterSummary): ChapterSummary {
  return {
    ...defaultChapterSummary(summary.chapterId),
    ...summary,
    keyEvents: summary.keyEvents || [],
    newFacts: summary.newFacts || [],
    characterStateChanges: summary.characterStateChanges || [],
    emotionLedger: normalizeEmotionLedger(summary.emotionLedger, summary.chapterId),
    foreshadowingUpdates: summary.foreshadowingUpdates || [],
    continuityRisks: summary.continuityRisks || [],
    powerProgressionUpdates: summary.powerProgressionUpdates || [],
    acceptedRecapIds: summary.acceptedRecapIds || [],
    updatedAt: summary.updatedAt || nowIso()
  };
}

function normalizeEmotionLedgerItem(
  item: Partial<EmotionLedgerItem> | string,
  chapterId: string,
  bucket: keyof EmotionLedger,
  index: number
): EmotionLedgerItem {
  const source = typeof item === "string" ? { description: item } : item;
  const description = String(source.description || "").trim();
  return {
    id: source.id || `emotion-${bucket}-${chapterId}-${index + 1}`,
    chapterId: source.chapterId || chapterId,
    characterName: source.characterName,
    description,
    cause: source.cause,
    status: source.status || "open",
    relatedEntities: Array.isArray(source.relatedEntities) ? source.relatedEntities : [],
    updatedAt: source.updatedAt || nowIso()
  };
}

function normalizeEmotionLedger(ledger: Partial<EmotionLedger> | undefined, chapterId: string): EmotionLedger {
  return {
    wounds: (ledger?.wounds || []).map((item, index) => normalizeEmotionLedgerItem(item, chapterId, "wounds", index)).filter((item) => item.description),
    boons: (ledger?.boons || []).map((item, index) => normalizeEmotionLedgerItem(item, chapterId, "boons", index)).filter((item) => item.description),
    powerShifts: (ledger?.powerShifts || [])
      .map((item, index) => normalizeEmotionLedgerItem(item, chapterId, "powerShifts", index))
      .filter((item) => item.description),
    openLoops: (ledger?.openLoops || [])
      .map((item, index) => normalizeEmotionLedgerItem(item, chapterId, "openLoops", index))
      .filter((item) => item.description)
  };
}

function mergeEmotionLedger(existing: Partial<EmotionLedger> | undefined, patch: Partial<EmotionLedger> | undefined, chapterId: string): EmotionLedger {
  const current = normalizeEmotionLedger(existing, chapterId);
  const incoming = normalizeEmotionLedger(patch, chapterId);
  return {
    wounds: mergeById(current.wounds, incoming.wounds),
    boons: mergeById(current.boons, incoming.boons),
    powerShifts: mergeById(current.powerShifts, incoming.powerShifts),
    openLoops: mergeById(current.openLoops, incoming.openLoops)
  };
}

export async function readChapterQualityReport(root: string, chapterId: string): Promise<ChapterQualityReport | null> {
  return readJsonFile<ChapterQualityReport | null>(root, chapterQualityPath(chapterId), null);
}

export async function saveChapterQualityReport(root: string, report: ChapterQualityReport): Promise<ChapterQualityReport> {
  const normalized: ChapterQualityReport = {
    ...report,
    metrics: report.metrics || [],
    strengths: report.strengths || [],
    fixes: report.fixes || [],
    updatedAt: report.updatedAt || nowIso()
  };
  await writeJsonFile(root, chapterQualityPath(report.chapterId), normalized);
  return normalized;
}

function roundScore(value: number): number {
  return Math.round(value * 10) / 10;
}

function weakestMetric(report: ChapterQualityReport): ChapterQualityReport["metrics"][number] | undefined {
  return [...report.metrics].sort((left, right) => left.score - right.score)[0];
}

function rhythmMetric(report?: ChapterQualityReport | null): ChapterQualityReport["metrics"][number] | undefined {
  return report?.metrics.find((metric) => metric.key === "rhythm");
}

function qualityMetric(report: ChapterQualityReport | null, key: ChapterQualityReport["metrics"][number]["key"]): ChapterQualityReport["metrics"][number] | undefined {
  return report?.metrics.find((metric) => metric.key === key);
}

function hasRhythmSignal(input: {
  report: ChapterQualityReport | null;
  dashboard: ChapterDashboard;
  scenes: SceneCard[];
  summary: ChapterSummary;
}): boolean {
  return Boolean(rhythmMetric(input.report) || input.dashboard.wordCount || input.scenes.length || input.summary.keyEvents.length);
}

function hasTensionSignal(input: {
  report: ChapterQualityReport | null;
  dashboard: ChapterDashboard;
  scenes: SceneCard[];
  summary: ChapterSummary;
}): boolean {
  return Boolean(input.report || input.dashboard.mainConflict || input.dashboard.endingHook || input.scenes.some((scene) => scene.conflict || scene.turn) || input.summary.keyEvents.length);
}

function buildRhythmSignals(
  chapters: Array<{
    chapter: NovelProject["chapters"][number];
    report: ChapterQualityReport | null;
    dashboard: ChapterDashboard;
    scenes: SceneCard[];
    summary: ChapterSummary;
  }>
): SeriesRhythmSignal[] {
  return chapters
    .filter(hasRhythmSignal)
    .map(({ chapter, report, dashboard, scenes, summary }) => {
      const rhythm = rhythmMetric(report);
      return {
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        rhythmScore: rhythm?.score,
        overallScore: report?.overallScore,
        wordCount: dashboard.wordCount || 0,
        sceneCount: scenes.length,
        beatCount: summary.keyEvents.length,
        note: rhythm?.note || summary.summary || dashboard.goal || "暂无节奏摘要。",
        updatedAt: report?.updatedAt || summary.updatedAt || dashboard.updatedAt
      };
    });
}

function buildCharacterArcSignals(summaries: ChapterSummary[]): CharacterArcSignal[] {
  const grouped = new Map<string, CharacterStatePatch[]>();
  for (const summary of summaries) {
    for (const change of summary.characterStateChanges) {
      if (change.status !== "accepted") continue;
      const name = change.characterName.trim();
      if (!name) continue;
      grouped.set(name, [...(grouped.get(name) || []), change]);
    }
  }

  return Array.from(grouped.entries())
    .map(([characterName, changes]) => {
      const ordered = [...changes].sort((left, right) => left.updatedAt.localeCompare(right.updatedAt));
      const latest = ordered[ordered.length - 1];
      const chapterIds = Array.from(new Set(ordered.map((change) => change.chapterId)));
      return {
        characterName,
        changeCount: ordered.length,
        chapterIds,
        firstChapterId: chapterIds[0] || latest.chapterId,
        lastChapterId: chapterIds[chapterIds.length - 1] || latest.chapterId,
        latestState: latest.after,
        latestCause: latest.cause,
        updatedAt: latest.updatedAt
      };
    })
    .sort((left, right) => right.changeCount - left.changeCount || right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, 8);
}

function weightedTensionScore(input: {
  conflict?: number;
  hook?: number;
  emotion?: number;
  rhythm?: number;
  sceneCount: number;
}): number {
  const weighted = [
    { value: input.conflict, weight: 0.4 },
    { value: input.hook, weight: 0.25 },
    { value: input.emotion, weight: 0.2 },
    { value: input.rhythm, weight: 0.15 }
  ].filter((item): item is { value: number; weight: number } => typeof item.value === "number");

  if (weighted.length) {
    const weightSum = weighted.reduce((sum, item) => sum + item.weight, 0);
    return roundScore(weighted.reduce((sum, item) => sum + item.value * item.weight, 0) / weightSum);
  }

  return Math.min(85, 45 + input.sceneCount * 8);
}

function buildTensionCurve(
  chapters: Array<{
    chapter: NovelProject["chapters"][number];
    report: ChapterQualityReport | null;
    dashboard: ChapterDashboard;
    scenes: SceneCard[];
    summary: ChapterSummary;
  }>
): SeriesTensionPoint[] {
  return chapters
    .filter(hasTensionSignal)
    .map(({ chapter, report, dashboard, scenes, summary }) => {
      const conflict = qualityMetric(report, "conflict");
      const hook = qualityMetric(report, "hook");
      const emotion = qualityMetric(report, "emotion");
      const rhythm = qualityMetric(report, "rhythm");
      const tension = qualityMetric(report, "tension");
      const note =
        tension?.note ||
        conflict?.note ||
        hook?.note ||
        dashboard.mainConflict ||
        scenes.find((scene) => scene.conflict || scene.turn)?.conflict ||
        scenes.find((scene) => scene.turn)?.turn ||
        summary.keyEvents[0] ||
        summary.summary ||
        "暂无张力摘要。";

      return {
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        tensionScore:
          tension?.score ??
          weightedTensionScore({
            conflict: conflict?.score,
            hook: hook?.score,
            emotion: emotion?.score,
            rhythm: rhythm?.score,
            sceneCount: scenes.length
          }),
        conflictScore: conflict?.score,
        hookScore: hook?.score,
        emotionScore: emotion?.score,
        rhythmScore: rhythm?.score,
        sceneCount: scenes.length,
        note,
        updatedAt: report?.updatedAt || dashboard.updatedAt || summary.updatedAt
      };
    });
}

function styleDriftSeverity(drift: number): SeriesStyleDriftSignal["severity"] {
  const magnitude = Math.abs(drift);
  if (magnitude >= 15) return "review";
  if (magnitude >= 8) return "watch";
  return "stable";
}

function buildStyleDriftSignals(
  reports: Array<{ chapter: NovelProject["chapters"][number]; report: ChapterQualityReport }>
): SeriesStyleDriftSignal[] {
  const proseReports = reports
    .map(({ chapter, report }) => ({
      chapter,
      report,
      prose: qualityMetric(report, "prose")
    }))
    .filter((item): item is { chapter: NovelProject["chapters"][number]; report: ChapterQualityReport; prose: ChapterQualityReport["metrics"][number] } =>
      Boolean(item.prose)
    );

  if (proseReports.length < 2) return [];

  const baselineScore = roundScore(proseReports.reduce((sum, item) => sum + item.prose.score, 0) / proseReports.length);
  return proseReports
    .map(({ chapter, report, prose }) => {
      const drift = roundScore(prose.score - baselineScore);
      return {
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        proseScore: prose.score,
        baselineScore,
        drift,
        severity: styleDriftSeverity(drift),
        note: prose.note,
        updatedAt: report.updatedAt
      };
    })
    .sort((left, right) => Math.abs(right.drift) - Math.abs(left.drift) || right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, 8);
}

function chapterOrder(project: NovelProject, chapterId: string): number | undefined {
  const chapter = project.chapters.find((item) => item.id === chapterId);
  if (typeof chapter?.order === "number" && chapter.order > 0) return chapter.order;
  const index = project.chapters.findIndex((item) => item.id === chapterId);
  if (index >= 0) return index + 1;
  const digitMatch = `${chapterId} ${chapter?.title || ""}`.match(/(\d+)/);
  return digitMatch ? Number(digitMatch[1]) : undefined;
}

function unresolvedLedgerEntries(entries: LedgerEntry[]): LedgerEntry[] {
  return entries.filter((entry) => entry.status !== "resolved");
}

function emotionOpenLoopCount(summary: ChapterSummary): number {
  return (summary.emotionLedger?.openLoops || []).filter((item) => item.status !== "resolved").length;
}

function isOverdueDebt(entry: LedgerEntry, currentOrder?: number): boolean {
  if (!entry.expectedResolutionChapterId || !currentOrder) return false;
  const expected = entry.expectedResolutionChapterId.match(/(\d+)/);
  return Boolean(expected && Number(expected[1]) <= currentOrder && entry.status !== "resolved");
}

function debtSeverity(input: { debtCount: number; riskCount: number; openLoopCount: number; overdueCount: number }): NarrativeDebtSignal["severity"] {
  if (input.overdueCount > 0 || input.riskCount >= 2) return "blocked";
  if (input.debtCount > 0 || input.openLoopCount > 0 || input.riskCount > 0) return "watch";
  return "stable";
}

function buildNarrativeDebtSignals(
  project: NovelProject,
  chapters: Array<{
    chapter: NovelProject["chapters"][number];
    summary: ChapterSummary;
  }>,
  ledgers: LedgerEntry[]
): NarrativeDebtSignal[] {
  return chapters
    .map(({ chapter, summary }) => {
      const currentOrder = chapterOrder(project, chapter.id);
      const relatedDebts = unresolvedLedgerEntries(
        ledgers.filter((entry) => entry.chapterIds.includes(chapter.id) || isOverdueDebt(entry, currentOrder))
      );
      const openForeshadowingCount = relatedDebts.filter((entry) => entry.kind === "foreshadowing").length;
      const riskCount = relatedDebts.filter((entry) => entry.kind === "risk" || entry.kind === "continuity" || entry.status === "blocked").length;
      const openLoopCount = emotionOpenLoopCount(summary);
      const overdueCount = relatedDebts.filter((entry) => isOverdueDebt(entry, currentOrder)).length;
      const debtCount = relatedDebts.length + openLoopCount;
      const severity = debtSeverity({ debtCount, riskCount, openLoopCount, overdueCount });
      const note =
        severity === "blocked"
          ? "叙事债务已到交付点，下一轮写作需要先解决或显式延期。"
          : severity === "watch"
            ? "存在开放伏笔、风险或情绪回路，需要在后续章节持续推进。"
            : "当前章节没有明显积压的叙事债务。";

      return {
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        debtCount,
        openForeshadowingCount,
        riskCount,
        openLoopCount,
        overdueCount,
        severity,
        note,
        updatedAt: summary.updatedAt
      };
    })
    .filter((signal) => signal.debtCount > 0)
    .sort((left, right) => {
      const severityRank = { blocked: 2, watch: 1, stable: 0 };
      return severityRank[right.severity] - severityRank[left.severity] || right.debtCount - left.debtCount || left.chapterId.localeCompare(right.chapterId);
    })
    .slice(0, 10);
}

function sceneCraftBeats(scene: SceneCard): CraftBeat[] {
  const explicit = Array.isArray(scene.craftBeats) ? scene.craftBeats : [];
  const inferred: CraftBeat[] = [];
  if (scene.readerPayoff?.trim()) {
    inferred.push({
      id: `craft-${scene.id}-payoff`,
      type: "payoff",
      label: scene.readerPayoff.trim(),
      required: false,
      status: "drafted"
    });
  }
  if (scene.powerProgression?.trim() || scene.progressionChange?.trim()) {
    inferred.push({
      id: `craft-${scene.id}-progression`,
      type: "progression",
      label: scene.progressionChange || scene.powerProgression,
      required: false,
      status: "drafted"
    });
  }
  if (scene.foreshadowingIds?.length) {
    inferred.push({
      id: `craft-${scene.id}-foreshadow`,
      type: "foreshadow_setup",
      label: scene.foreshadowingIds.join(", "),
      required: false,
      status: "drafted"
    });
  }
  if (scene.narrativeFunction?.toLowerCase().includes("daily") || scene.narrativeFunction?.includes("日常")) {
    inferred.push({
      id: `craft-${scene.id}-slice`,
      type: "slice_of_life",
      label: scene.narrativeFunction,
      required: false,
      status: "drafted"
    });
  }
  return mergeById(explicit, inferred);
}

function craftCoverageSeverity(input: { requiredBeatCount: number; missingRequiredBeatCount: number; craftBeatCount: number }): CraftCoverageSignal["severity"] {
  if (input.requiredBeatCount > 0 && input.missingRequiredBeatCount > 0) return "blocked";
  if (input.craftBeatCount === 0) return "watch";
  return "stable";
}

function buildCraftCoverageSignals(
  chapters: Array<{
    chapter: NovelProject["chapters"][number];
    scenes: SceneCard[];
    report: ChapterQualityReport | null;
    dashboard: ChapterDashboard;
    summary: ChapterSummary;
  }>
): CraftCoverageSignal[] {
  return chapters
    .map(({ chapter, scenes, report, dashboard, summary }) => {
      const beats = scenes.flatMap(sceneCraftBeats);
      const requiredBeatCount = beats.filter((beat) => beat.required).length;
      const missingRequiredBeatCount = beats.filter((beat) => beat.required && beat.status === "missed").length;
      const countByType = (types: CraftBeat["type"][]) => beats.filter((beat) => types.includes(beat.type)).length;
      const payoffCount = countByType(["payoff"]);
      const foreshadowingCount = countByType(["foreshadow_setup", "foreshadow_payoff"]);
      const progressionCount = countByType(["progression"]);
      const sliceOfLifeCount = countByType(["slice_of_life"]);
      const redemptionCount = countByType(["redemption", "sublimation"]);
      const severity = craftCoverageSeverity({ requiredBeatCount, missingRequiredBeatCount, craftBeatCount: beats.length });
      const note =
        beats.length > 0
          ? `${beats.length} craft beats tracked: payoff ${payoffCount}, foreshadowing ${foreshadowingCount}, progression ${progressionCount}.`
          : summary.summary || dashboard.goal || report?.summary || "No craft beats tracked for this chapter yet.";
      return {
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        craftBeatCount: beats.length,
        requiredBeatCount,
        missingRequiredBeatCount,
        payoffCount,
        foreshadowingCount,
        progressionCount,
        sliceOfLifeCount,
        redemptionCount,
        note,
        severity,
        updatedAt: report?.updatedAt || summary.updatedAt || dashboard.updatedAt
      };
    })
    .filter((signal) => signal.craftBeatCount > 0 || signal.severity !== "stable")
    .sort((left, right) => {
      const severityRank = { blocked: 2, watch: 1, stable: 0 };
      return severityRank[right.severity] - severityRank[left.severity] || right.craftBeatCount - left.craftBeatCount;
    })
    .slice(0, 10);
}

function buildQualityTrend(
  key: SeriesQualityTrend["key"],
  label: string,
  points: SeriesQualityTrend["points"]
): SeriesQualityTrend | null {
  if (!points.length) return null;
  const latest = points[points.length - 1];
  const previous = points[points.length - 2];
  return {
    key,
    label,
    points,
    averageScore: roundScore(points.reduce((sum, point) => sum + point.score, 0) / points.length),
    latestScore: latest.score,
    previousScore: previous?.score,
    delta: previous ? roundScore(latest.score - previous.score) : undefined
  };
}

function buildQualityTrends(
  reports: Array<{ chapter: NovelProject["chapters"][number]; report: ChapterQualityReport }>
): SeriesQualityTrend[] {
  const overall = buildQualityTrend(
    "overall",
    "Overall",
    reports.map(({ chapter, report }) => ({
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      score: report.overallScore,
      updatedAt: report.updatedAt
    }))
  );

  const metricGroups = new Map<
    ChapterQualityReport["metrics"][number]["key"],
    { key: ChapterQualityReport["metrics"][number]["key"]; label: string; points: SeriesQualityTrend["points"] }
  >();

  reports.forEach(({ chapter, report }) => {
    report.metrics.forEach((metric) => {
      const group = metricGroups.get(metric.key) || { key: metric.key, label: metric.label, points: [] };
      group.points.push({
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        score: metric.score,
        updatedAt: report.updatedAt
      });
      metricGroups.set(metric.key, group);
    });
  });

  const metricTrends = Array.from(metricGroups.values())
    .map((group) => buildQualityTrend(group.key, group.label, group.points))
    .filter((trend): trend is SeriesQualityTrend => Boolean(trend))
    .sort((left, right) => left.averageScore - right.averageScore || left.label.localeCompare(right.label));

  return overall ? [overall, ...metricTrends] : metricTrends;
}

export async function buildSeriesQualityMetrics(root: string, project: NovelProject): Promise<SeriesQualityMetrics> {
  const [chapterSignals, allLedgers] = await Promise.all([
    Promise.all(project.chapters.map(async (chapter) => {
      const [report, dashboard, scenes, summary] = await Promise.all([
        readChapterQualityReport(root, chapter.id),
        readChapterDashboard(root, chapter.id),
        readSceneCards(root, chapter.id),
        readChapterSummary(root, chapter.id)
      ]);
      return { chapter, report, dashboard, scenes, summary };
    })),
    Promise.all((Object.keys(ledgerPaths) as LedgerKind[]).map((kind) => readLedgerEntries(root, kind))).then((items) => items.flat())
  ]);

  const reports = chapterSignals
    .map(({ chapter, report }) => ({
      chapter,
      report
    }))
    .filter((item): item is { chapter: NovelProject["chapters"][number]; report: ChapterQualityReport } => Boolean(item.report));

  const metricGroups = new Map<string, { key: ChapterQualityReport["metrics"][number]["key"]; label: string; scores: number[] }>();
  reports.forEach(({ report }) => {
    report.metrics.forEach((metric) => {
      const existing = metricGroups.get(metric.key) || { key: metric.key, label: metric.label, scores: [] };
      existing.scores.push(metric.score);
      metricGroups.set(metric.key, existing);
    });
  });

  const metricAverages: SeriesQualityMetricAverage[] = Array.from(metricGroups.values())
    .map((group) => ({
      key: group.key,
      label: group.label,
      averageScore: roundScore(group.scores.reduce((sum, score) => sum + score, 0) / group.scores.length),
      reportCount: group.scores.length
    }))
    .sort((left, right) => left.averageScore - right.averageScore || left.key.localeCompare(right.key));

  const weakestChapters = reports
    .map(({ chapter, report }) => {
      const weak = weakestMetric(report);
      return {
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        overallScore: report.overallScore,
        weakestMetricKey: weak?.key,
        weakestMetricLabel: weak?.label,
        weakestMetricScore: weak?.score,
        updatedAt: report.updatedAt
      };
    })
    .sort((left, right) => left.overallScore - right.overallScore)
    .slice(0, 5);

  const metrics: SeriesQualityMetrics = {
    projectSlug: project.slug,
    chapterCount: project.chapters.length,
    reportCount: reports.length,
    averageOverallScore: reports.length
      ? roundScore(reports.reduce((sum, item) => sum + item.report.overallScore, 0) / reports.length)
      : 0,
    metricAverages,
    weakestChapters,
    rhythmSignals: buildRhythmSignals(chapterSignals),
    characterArcSignals: buildCharacterArcSignals(chapterSignals.map((item) => item.summary)),
    qualityTrends: buildQualityTrends(reports),
    tensionCurve: buildTensionCurve(chapterSignals),
    styleDriftSignals: buildStyleDriftSignals(reports),
    narrativeDebtSignals: buildNarrativeDebtSignals(project, chapterSignals, allLedgers),
    craftCoverageSignals: buildCraftCoverageSignals(chapterSignals),
    updatedAt: nowIso()
  };

  await writeJsonFile(root, seriesQualityPath(), metrics);
  return metrics;
}

export async function readSeriesQualityMetrics(root: string, project: NovelProject): Promise<SeriesQualityMetrics> {
  const cached = await readJsonFile<SeriesQualityMetrics | null>(root, seriesQualityPath(), null);
  return cached?.rhythmSignals &&
    cached.characterArcSignals &&
    cached.qualityTrends &&
    cached.tensionCurve &&
    cached.styleDriftSignals &&
    cached.narrativeDebtSignals &&
    cached.craftCoverageSignals
    ? cached
    : buildSeriesQualityMetrics(root, project);
}

export async function readSceneCards(root: string, chapterId: string): Promise<SceneCard[]> {
  const cards = await readJsonFile<SceneCard[]>(root, sceneCardsPath(chapterId), []);
  return [...cards].sort((left, right) => left.order - right.order);
}

export async function saveSceneCards(root: string, chapterId: string, cards: SceneCard[]): Promise<SceneCard[]> {
  const normalized = [...cards]
    .sort((left, right) => left.order - right.order)
    .map((card, index) => ({
      ...card,
      chapterId,
      order: index + 1,
      updatedAt: card.updatedAt || nowIso()
    }));
  await writeJsonFile(root, sceneCardsPath(chapterId), normalized);
  return normalized;
}

export async function readStoryControl(root: string): Promise<StoryControl> {
  return readJsonFile(root, storyControlPath(), defaultStoryControl());
}

export async function saveStoryControl(root: string, storyControl: StoryControl): Promise<StoryControl> {
  const normalized: StoryControl = {
    ...storyControl,
    version: 1,
    arcs: storyControl.arcs || [],
    characters: storyControl.characters || [],
    events: storyControl.events || [],
    orchestrationNotes: storyControl.orchestrationNotes || "",
    updatedAt: nowIso()
  };
  await writeJsonFile(root, storyControlPath(), normalized);
  return normalized;
}

export async function readLedgerEntries(root: string, kind: LedgerKind): Promise<LedgerEntry[]> {
  return readJsonFile<LedgerEntry[]>(root, ledgerPath(kind), []);
}

export async function saveLedgerEntries(root: string, kind: LedgerKind, entries: LedgerEntry[]): Promise<LedgerEntry[]> {
  const normalized = normalizeLedgerEntries(kind, entries);
  await writeJsonFile(root, ledgerPath(kind), normalized);
  return normalized;
}

function normalizeLedgerEntries(kind: LedgerKind, entries: LedgerEntry[]): LedgerEntry[] {
  return entries.map((entry) => ({
    ...entry,
    kind,
    updatedAt: entry.updatedAt || nowIso()
  }));
}

export async function appendWritingRecap(root: string, recap: WritingRecapCandidate): Promise<void> {
  const target = resolveInside(root, "tasks/recaps.jsonl");
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.appendFile(target, `${JSON.stringify(recap)}\n`, "utf8");
}

export async function appendWritingRecapIfMissing(root: string, recap: WritingRecapCandidate): Promise<boolean> {
  const target = resolveInside(root, "tasks/recaps.jsonl");
  const serialized = JSON.stringify(recap);
  const existing = await fs.readFile(target, "utf8").catch(() => "");
  if (existing.split(/\r?\n/).some((line) => line === serialized)) return false;
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.appendFile(target, `${serialized}\n`, "utf8");
  return true;
}

export async function acceptWritingRecapPatches(root: string, recap: WritingRecapCandidate): Promise<ChapterSummary> {
  const existingSummary = await readChapterSummary(root, recap.chapterId);
  const acceptedFacts = acceptedFactPatches(recap.factPatches?.length ? recap.factPatches : legacyFactPatches(recap));
  const acceptedCharacters = acceptedCharacterStatePatches(
    recap.characterStatePatches?.length ? recap.characterStatePatches : legacyCharacterPatches(recap)
  );
  const ledgerPatches = mergeById(
    [...recap.foreshadowingUpdates, ...recap.continuityRisks, ...recap.powerProgressionUpdates],
    recap.ledgerPatches || []
  );
  const riskPatches = recap.riskPatches || [];
  const foreshadowingUpdates = ledgerPatches.filter((entry) => entry.kind === "foreshadowing");
  const continuityRisks = [...ledgerPatches.filter((entry) => entry.kind === "continuity"), ...riskPatches];
  const powerProgressionUpdates = ledgerPatches.filter((entry) => entry.kind === "power");
  const acceptanceId = recapAcceptanceId(recap);
  const summaryPatch = recap.summaryPatch || {};
  const summaryEmotionLedger = mergeEmotionLedger(existingSummary.emotionLedger, summaryPatch.emotionLedger, recap.chapterId);
  const nextEmotionLedger = mergeEmotionLedger(summaryEmotionLedger, recap.emotionLedgerPatch, recap.chapterId);
  const nextSummary: ChapterSummary = {
    ...existingSummary,
    ...summaryPatch,
    chapterId: recap.chapterId,
    summary: summaryPatch.summary || recap.summary || existingSummary.summary,
    keyEvents: summaryPatch.keyEvents || existingSummary.keyEvents,
    newFacts: mergeById(existingSummary.newFacts, acceptedFacts),
    characterStateChanges: mergeById(existingSummary.characterStateChanges, acceptedCharacters),
    emotionLedger: nextEmotionLedger,
    foreshadowingUpdates: mergeById(existingSummary.foreshadowingUpdates, foreshadowingUpdates),
    continuityRisks: mergeById(existingSummary.continuityRisks, continuityRisks),
    powerProgressionUpdates: mergeById(existingSummary.powerProgressionUpdates, powerProgressionUpdates),
    acceptedRecapIds: Array.from(new Set([...existingSummary.acceptedRecapIds, acceptanceId])),
    updatedAt: nowIso()
  };

  const updatesByKind = [...ledgerPatches, ...riskPatches].reduce<Partial<Record<LedgerKind, LedgerEntry[]>>>(
    (groups, entry) => {
      groups[entry.kind] = [...(groups[entry.kind] || []), entry];
      return groups;
    },
    {}
  );
  const writes: Array<{ relativePath: string; content: string }> = [];
  for (const [kind, entries] of Object.entries(updatesByKind) as Array<[LedgerKind, LedgerEntry[]]>) {
    const existing = await readLedgerEntries(root, kind);
    writes.push({
      relativePath: ledgerPath(kind),
      content: jsonContent(normalizeLedgerEntries(kind, mergeById(existing, entries)))
    });
  }

  const savedSummary = normalizeChapterSummary(nextSummary);
  const existingRecaps = await readOptionalTextFile(root, "tasks/recaps.jsonl");
  const recapPrefix = existingRecaps ? (existingRecaps.endsWith("\n") ? existingRecaps : `${existingRecaps}\n`) : "";
  writes.push({
    relativePath: chapterSummaryPath(recap.chapterId),
    content: jsonContent(savedSummary)
  });
  writes.push({
    relativePath: "tasks/recaps.jsonl",
    content: `${recapPrefix}${JSON.stringify(recap)}\n`
  });

  await writeFilesTransaction(root, writes);
  return savedSummary;
}
