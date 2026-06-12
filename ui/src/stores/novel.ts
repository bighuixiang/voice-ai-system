import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { novelApi } from "@/services/novelApi";
import type {
  AiAgentCheckResult,
  AiAgentProfile,
  AiInvocationSession,
  AiStageDefinition,
  ChapterDashboard,
  ChapterSummary,
  ChapterQualityReport,
  CreationRuntimeSnapshot,
  CodexTaskResult,
  CodexTaskType,
  ChapterDocumentKind,
  CreationLoopAction,
  CreationLoopStep,
  EditorSuggestion,
  EditorSuggestionRequest,
  EditorSelection,
  BackgroundJob,
  BackgroundJobType,
  FileDiffResult,
  FileVersionSnapshot,
  FocusWritingGuide,
  KnowledgeIndexProjection,
  KnowledgeSearchResult,
  LedgerEntry,
  NovelFilePatch,
  NovelChapter,
  NovelProject,
  NovelTask,
  PlatformAiConfig,
  PlatformAsset,
  PlatformAssetType,
  PlatformLibrary,
  ProjectAuditReport,
  SceneCard,
  SavePipelineStep,
  SavePipelineStepId,
  SavePipelineStepStatus,
  SeriesQualityMetrics,
  StoryControl,
  StoryGraphProjection,
  StyleToneKey,
  TaskProgressStep,
  WritingMode,
  EmotionLedger,
  WritingRecapCandidate
} from "@/types/novel";

type LedgerKind = LedgerEntry["kind"];
const DEFAULT_FOCUS_TARGET_WORDS = 3000;
const aiScenarioKeys = ["novel", "assets", "script", "image-generation", "video-generation"] as const;

interface WorkspaceCache {
  project: NovelProject;
  chapterId: string | null;
  documentKind: ChapterDocumentKind;
  filePath: string;
  content: string;
  savedContent: string;
  lastSavedAt: string;
  selection: EditorSelection | null;
  rewriteSelection: EditorSelection | null;
  currentTask: NovelTask | null;
  taskProgress: TaskProgressStep[];
  taskHistory: NovelTask[];
  aiInvocations: AiInvocationSession[];
  rewriteCandidate: CodexTaskResult | null;
  recapCandidate: WritingRecapCandidate | null;
  qualityReport: ChapterQualityReport | null;
  seriesQualityMetrics: SeriesQualityMetrics | null;
  styleTone: StyleToneKey;
  focusTargetWords: number;
  focusDraftInstruction: string;
  dashboard: ChapterDashboard | null;
  chapterSummary: ChapterSummary | null;
  runtimeSnapshot: CreationRuntimeSnapshot | null;
  sceneCards: SceneCard[];
  storyControl: StoryControl | null;
  storyGraph: StoryGraphProjection | null;
  knowledgeIndex: KnowledgeIndexProjection | null;
  structureIdeaInput: string;
  structureDraftVersion: number;
  ledgerKind: LedgerKind;
  ledgerEntries: LedgerEntry[];
  writingMode: WritingMode;
  supportPath: string;
  supportContent: string;
  savedSupportContent: string;
}

interface WorkspaceSwitchOptions {
  skipLeaveCheck?: boolean;
}

interface ReverseStructurePayload {
  dashboard?: Partial<ChapterDashboard>;
  scenes?: Array<Partial<SceneCard>>;
  sceneCards?: Array<Partial<SceneCard>>;
}

function makeDefaultPlatformAiConfig(): PlatformAiConfig {
  return {
    version: 1,
    defaultScenario: "novel",
    scenarios: aiScenarioKeys.reduce(
      (scenarios, key) => ({
        ...scenarios,
        [key]: { profileId: "codex-cli" }
      }),
      {} as PlatformAiConfig["scenarios"]
    ),
    knowledgeEmbedding: {
      provider: "local",
      baseUrl: "https://api.openai.com/v1",
      model: "text-embedding-3-small",
      apiKeyConfigured: false
    },
    updatedAt: new Date().toISOString()
  };
}

export const useNovelStore = defineStore("novel", () => {
  const projects = ref<NovelProject[]>([]);
  const openWorkspaceSlugs = ref<string[]>([]);
  const workspaceCache = ref<Record<string, WorkspaceCache>>({});
  const currentProject = ref<NovelProject | null>(null);
  const currentChapter = ref<NovelChapter | null>(null);
  const currentDocumentKind = ref<ChapterDocumentKind>("content");
  const currentFilePath = ref("");
  const currentContent = ref("");
  const savedContent = ref("");
  const isSavingContent = ref(false);
  const lastSavedAt = ref("");
  const selection = ref<EditorSelection | null>(null);
  const rewriteSelection = ref<EditorSelection | null>(null);
  const currentTask = ref<NovelTask | null>(null);
  const activeTaskType = ref<CodexTaskType | null>(null);
  const activeAsyncTaskId = ref<string | null>(null);
  const taskProgress = ref<TaskProgressStep[]>([]);
  const taskHistory = ref<NovelTask[]>([]);
  const aiInvocations = ref<AiInvocationSession[]>([]);
  const aiStages = ref<AiStageDefinition[]>([]);
  const backgroundJobs = ref<BackgroundJob[]>([]);
  const rewriteCandidate = ref<CodexTaskResult | null>(null);
  const recapCandidate = ref<WritingRecapCandidate | null>(null);
  const currentQualityReport = ref<ChapterQualityReport | null>(null);
  const currentSeriesQualityMetrics = ref<SeriesQualityMetrics | null>(null);
  const styleTone = ref<StyleToneKey>("elegant");
  const focusTargetWords = ref(DEFAULT_FOCUS_TARGET_WORDS);
  const focusDraftInstruction = ref("");
  const currentDashboard = ref<ChapterDashboard | null>(null);
  const currentChapterSummary = ref<ChapterSummary | null>(null);
  const currentRuntimeSnapshot = ref<CreationRuntimeSnapshot | null>(null);
  const sceneCards = ref<SceneCard[]>([]);
  const storyControl = ref<StoryControl | null>(null);
  const storyGraph = ref<StoryGraphProjection | null>(null);
  const knowledgeIndex = ref<KnowledgeIndexProjection | null>(null);
  const knowledgeSearchResult = ref<KnowledgeSearchResult | null>(null);
  const structureIdeaInput = ref("");
  const structureDraftVersion = ref(0);
  const activeLedgerKind = ref<LedgerKind>("foreshadowing");
  const ledgerEntries = ref<LedgerEntry[]>([]);
  const writingMode = ref<WritingMode>("structure");
  const isSavingDashboard = ref(false);
  const isSavingScenes = ref(false);
  const isSavingStoryControl = ref(false);
  const isRebuildingKnowledgeIndex = ref(false);
  const isRebuildingSeriesQualityMetrics = ref(false);
  const isRebuildingStoryGraph = ref(false);
  const isSearchingKnowledge = ref(false);
  const isReverseEngineeringStructure = ref(false);
  const agentProfiles = ref<AiAgentProfile[]>([]);
  const agentChecks = ref<AiAgentCheckResult[]>([]);
  const defaultAgentProfileId = ref("codex-cli");
  const isSavingAiConfig = ref(false);
  const platformAiConfig = ref<PlatformAiConfig>(makeDefaultPlatformAiConfig());
  const platformLibrary = ref<PlatformLibrary | null>(null);
  const supportFiles = [
    { label: "角色", path: "bible/characters.md" },
    { label: "世界观", path: "bible/world.md" },
    { label: "力量体系", path: "bible/power-system.md" },
    { label: "地点", path: "bible/locations.md" },
    { label: "文风", path: "style/style-guide.md" },
    { label: "卷纲", path: "outline/volume-01.md" },
    { label: "伏笔", path: "ledger/foreshadowing.md" },
    { label: "连续性", path: "ledger/continuity.md" },
    { label: "升级节奏", path: "ledger/power-progression.md" }
  ];
  const currentSupportPath = ref(supportFiles[0].path);
  const supportContent = ref("");
  const savedSupportContent = ref("");
  const isLoading = ref(false);
  const error = ref("");
  const isExportingAuditReport = ref(false);
  const auditReportPreview = ref<ProjectAuditReport | null>(null);
  const isLoadingAuditReportPreview = ref(false);
  const fileVersions = ref<FileVersionSnapshot[]>([]);
  const currentFileDiff = ref<FileDiffResult | null>(null);
  const isLoadingFileVersions = ref(false);
  const isLoadingFileDiff = ref(false);
  const autoRunSavePipeline = ref(false);
  const savePipelineSteps = ref<SavePipelineStep[]>([]);
  const isRunningSavePipeline = ref(false);

  const hasProject = computed(() => currentProject.value !== null);
  const openWorkspaceProjects = computed(() =>
    openWorkspaceSlugs.value
      .map((slug) => projects.value.find((project) => project.slug === slug))
      .filter((project): project is NovelProject => Boolean(project))
  );
  const hasUnsavedChanges = computed(() => currentContent.value !== savedContent.value);
  const currentDocumentLabel = computed(() => (currentDocumentKind.value === "content" ? "章节正文" : "章纲设定"));
  const currentSaveStateLabel = computed(() => {
    if (isSavingContent.value) return "保存中";
    if (hasUnsavedChanges.value) return "有未保存修改";
    if (lastSavedAt.value) return `已保存 ${lastSavedAt.value}`;
    return "已保存";
  });
  const hasUnsavedSupportChanges = computed(() => supportContent.value !== savedSupportContent.value);
  const canUseSelection = computed(() => Boolean(selection.value?.selectedText));
  const canTuneSelection = computed(() => Boolean(selection.value?.selectedText?.trim()));
  const activeRewriteSelection = computed(() => rewriteSelection.value || selection.value);
  const canDiagnoseChapter = computed(() => currentDocumentKind.value === "content" && countDraftWords(currentContent.value) >= 30);
  const canReverseEngineerStructure = computed(
    () =>
      currentDocumentKind.value === "content" &&
      currentContent.value.replace(/\s+/g, "").length >= 20 &&
      !isLoading.value &&
      !isReverseEngineeringStructure.value
  );
  const canRequestFocusDraft = computed(() => Boolean(currentProject.value && currentChapter.value && !isLoading.value));
  const canRequestStoryOrchestration = computed(() => Boolean(currentProject.value && storyControl.value && !isLoading.value));
  const activeNovelAiConfig = computed(() => platformAiConfig.value.scenarios.novel);
  const activeNovelAgentProfile = computed(() =>
    agentProfiles.value.find((profile) => profile.id === activeNovelAiConfig.value.profileId)
  );
  const activeNovelAgentCheck = computed(() => agentChecks.value.find((check) => check.profileId === activeNovelAiConfig.value.profileId));
  const activeNovelAiSummary = computed(() => {
    const profileLabel = activeNovelAgentProfile.value?.label || activeNovelAiConfig.value.profileId || "Codex CLI";
    const modelLabel =
      activeNovelAgentProfile.value?.models.find((model) => model.id === activeNovelAiConfig.value.modelId)?.label ||
      activeNovelAiConfig.value.modelId ||
      "默认模型";
    return `${profileLabel} · ${modelLabel}`;
  });
  const currentWordCount = computed(() => countDraftWords(currentContent.value));
  const focusProgressPercent = computed(() => {
    if (!focusTargetWords.value) return 0;
    return clampScore((currentWordCount.value / focusTargetWords.value) * 100);
  });
  const hasChapterStructure = computed(() =>
    Boolean(
      currentDashboard.value?.goal ||
        currentDashboard.value?.pov ||
        currentDashboard.value?.mainConflict ||
        currentDashboard.value?.endingHook ||
        sceneCards.value.length
    )
  );
  const hasDraftContent = computed(() => currentWordCount.value >= 30);
  const hasSavedDraftContent = computed(() => hasDraftContent.value && !hasUnsavedChanges.value);
  const hasChapterQualityReport = computed(
    () => Boolean(currentQualityReport.value && currentQualityReport.value.chapterId === (currentChapter.value?.id || currentDashboard.value?.chapterId))
  );
  const hasAcceptedLedgerForCurrentChapter = computed(() => {
    const chapterId = currentChapter.value?.id || currentDashboard.value?.chapterId;
    return Boolean(chapterId && ledgerEntries.value.some((entry) => entry.chapterIds.includes(chapterId)));
  });
  const hasWritingRecapTaskForCurrentChapter = computed(() => {
    const chapterId = currentChapter.value?.id || currentDashboard.value?.chapterId;
    return Boolean(
      chapterId &&
        taskHistory.value.some(
          (task) =>
            task.type === "writing.recap" &&
            task.status === "success" &&
            (task.inputSummary.includes(chapterId) || task.result?.content.includes(chapterId))
        )
    );
  });
  function emotionLedgerCount(ledger?: Partial<EmotionLedger>): number {
    return (
      (ledger?.wounds?.length || 0) +
      (ledger?.boons?.length || 0) +
      (ledger?.powerShifts?.length || 0) +
      (ledger?.openLoops?.length || 0)
    );
  }
  const pendingEmotionLedgerCount = computed(() => emotionLedgerCount(recapCandidate.value?.emotionLedgerPatch));
  const acceptedEmotionLedgerCount = computed(() => emotionLedgerCount(currentChapterSummary.value?.emotionLedger));
  const radarBackgroundJobLabels: Record<BackgroundJobType, string> = {
    "knowledge.index.rebuild": "知识索引",
    "quality.series.rebuild": "质量趋势",
    "story.graph.rebuild": "故事图谱"
  };
  const radarSavePipelineLabels: Record<SavePipelineStepId, string> = {
    save: "保存",
    recap: "回顾",
    runtime: "运行态",
    quality: "质量",
    knowledge: "索引",
    story: "图谱"
  };
  function latestBackgroundJob(type: BackgroundJobType): BackgroundJob | undefined {
    return backgroundJobs.value
      .filter((job) => job.type === type)
      .sort((left, right) => Date.parse(right.updatedAt || right.startedAt) - Date.parse(left.updatedAt || left.startedAt))[0];
  }
  function backgroundJobSignals(types: BackgroundJobType[]): string[] {
    return types.flatMap((type) => {
      const job = latestBackgroundJob(type);
      if (!job) return [];
      const label = radarBackgroundJobLabels[type];
      if (job.status === "error") return [`${label}失败`];
      if (job.status === "running" || job.status === "pending") return [`${label}后台中`];
      if (job.status === "cancelled") return [`${label}已取消`];
      return [];
    });
  }
  function savePipelineSignals(ids: SavePipelineStepId[]): string[] {
    if (!savePipelineSteps.value.length) return [];
    return ids.flatMap((id) => {
      const step = savePipelineSteps.value.find((item) => item.id === id);
      if (!step) return [];
      const label = radarSavePipelineLabels[id];
      if (step.status === "error") return [`${label}失败`];
      if (step.status === "running") return [`${label}进行中`];
      if (step.status === "queued") return [`${label}后台队列`];
      if (step.status === "skipped") return [`${label}跳过`];
      return [];
    });
  }
  const recapStateSignals = computed(() => {
    const signals: string[] = [];
    if (pendingEmotionLedgerCount.value) signals.push(`情绪待入账 ${pendingEmotionLedgerCount.value}`);
    if (recapCandidate.value?.summaryPatch?.keyEvents?.length) signals.push(`事件 ${recapCandidate.value.summaryPatch.keyEvents.length}`);
    if (recapCandidate.value?.ledgerPatches?.length) signals.push(`账本补丁 ${recapCandidate.value.ledgerPatches.length}`);
    if (acceptedEmotionLedgerCount.value) signals.push(`情绪已沉淀 ${acceptedEmotionLedgerCount.value}`);
    return signals;
  });
  const runtimeNarrativeDebtSignals = computed(() => {
    const debt = currentRuntimeSnapshot.value?.signals.narrativeDebt;
    if (!debt?.debtCount) return [];
    const label = debt.severity === "blocked" ? "叙事债务需交付" : debt.severity === "watch" ? "叙事债务观察" : "叙事债务稳定";
    const parts = [`${label} ${debt.debtCount}`];
    if (debt.overdueCount) parts.push(`逾期 ${debt.overdueCount}`);
    if (debt.riskCount) parts.push(`风险 ${debt.riskCount}`);
    if (debt.openLoopCount) parts.push(`情绪回路 ${debt.openLoopCount}`);
    return [parts.join(" / ")];
  });
  const creationLoopSteps = computed<CreationLoopStep[]>(() => {
    const savedDraftBlocked = !hasSavedDraftContent.value;
    return [
      {
        id: "structure",
        label: "结构",
        status: hasChapterStructure.value ? "done" : writingMode.value === "structure" ? "active" : "waiting",
        detail: hasChapterStructure.value ? "仪表盘/场景卡已形成写作约束" : "先从想法或正文反写章节骨架",
        metric: sceneCards.value.length ? `${sceneCards.value.length} 场` : currentDashboard.value?.status || "未建",
        signals: backgroundJobSignals(["story.graph.rebuild"]),
        action: "open-structure",
        actionLabel: hasChapterStructure.value ? "查看结构" : "补结构"
      },
      {
        id: "draft",
        label: "正文",
        status: hasSavedDraftContent.value ? "done" : hasDraftContent.value ? "active" : writingMode.value === "focus" ? "active" : "waiting",
        detail: hasDraftContent.value ? (hasUnsavedChanges.value ? "正文已有修改，保存后进入审稿/回顾" : "正文已保存，可进入审稿") : "按下一拍生成或手写正文",
        metric: `${currentWordCount.value} 字`,
        signals: [...(hasUnsavedChanges.value ? ["正文未保存"] : []), ...savePipelineSignals(["save"])],
        action: hasDraftContent.value && hasUnsavedChanges.value ? "save-draft" : "open-focus",
        actionLabel: hasDraftContent.value && hasUnsavedChanges.value ? "保存正文" : "去写作"
      },
      {
        id: "review",
        label: "审稿",
        status: hasChapterQualityReport.value ? "done" : writingMode.value === "review" ? "active" : savedDraftBlocked ? "blocked" : "waiting",
        detail: hasChapterQualityReport.value ? "已有本章质量体检结果" : savedDraftBlocked ? "需要先保存可审正文" : "检查冲突、节奏、信息释放和文风风险",
        metric: hasChapterQualityReport.value ? `${currentQualityReport.value?.overallScore || 0} 分` : "待体检",
        signals: [...backgroundJobSignals(["quality.series.rebuild"]), ...savePipelineSignals(["quality"])],
        action: hasChapterQualityReport.value ? "open-review" : "diagnose",
        actionLabel: hasChapterQualityReport.value ? "看报告" : "体检本章"
      },
      {
        id: "recap",
        label: "章后回顾",
        status: recapCandidate.value ? "active" : hasWritingRecapTaskForCurrentChapter.value ? "done" : savedDraftBlocked ? "blocked" : "waiting",
        detail: recapCandidate.value ? "有待确认的状态补丁" : savedDraftBlocked ? "保存正文后再抽取事实变化" : "抽取摘要、事实、人物变化和账本候选",
        metric: recapCandidate.value
          ? `${recapCandidate.value.newFacts.length + recapCandidate.value.characterStateChanges.length} 条`
          : hasWritingRecapTaskForCurrentChapter.value
            ? "已生成"
            : "待生成",
        signals: [...recapStateSignals.value, ...savePipelineSignals(["recap", "runtime"])],
        action: recapCandidate.value ? "accept-recap" : "request-recap",
        actionLabel: recapCandidate.value ? "入账" : "生成回顾"
      },
      {
        id: "ledger",
        label: "账本",
        status: hasAcceptedLedgerForCurrentChapter.value ? "done" : recapCandidate.value ? "active" : savedDraftBlocked ? "blocked" : "waiting",
        detail: hasAcceptedLedgerForCurrentChapter.value ? "本章已有账本状态沉淀" : recapCandidate.value ? "确认后写入伏笔/风险/升级账本" : "等待章后回顾产生可采纳条目",
        metric: hasAcceptedLedgerForCurrentChapter.value
          ? `${ledgerEntries.value.length} 条`
          : pendingEmotionLedgerCount.value
            ? `情绪 ${pendingEmotionLedgerCount.value}`
            : "待入账",
        signals: [
          ...recapStateSignals.value,
          ...runtimeNarrativeDebtSignals.value,
          ...backgroundJobSignals(["knowledge.index.rebuild"]),
          ...savePipelineSignals(["knowledge"])
        ],
        action: recapCandidate.value ? "accept-recap" : "request-recap",
        actionLabel: recapCandidate.value ? "确认入账" : "先回顾"
      },
      {
        id: "next",
        label: "下一章",
        status: hasAcceptedLedgerForCurrentChapter.value || hasWritingRecapTaskForCurrentChapter.value ? "done" : "waiting",
        detail: hasAcceptedLedgerForCurrentChapter.value || hasWritingRecapTaskForCurrentChapter.value ? "下一章可读取回顾与账本继续推进" : "完成回顾和账本后，下一章上下文更稳",
        metric: currentChapter.value?.status || "当前章",
        signals: [
          ...(acceptedEmotionLedgerCount.value ? [`情绪线 ${acceptedEmotionLedgerCount.value}`] : []),
          ...runtimeNarrativeDebtSignals.value,
          ...backgroundJobSignals(["knowledge.index.rebuild", "story.graph.rebuild"]),
          ...savePipelineSignals(["story"])
        ],
        action: "open-structure",
        actionLabel: "规划后续"
      }
    ];
  });
  const activeSceneCard = computed(() => {
    if (!sceneCards.value.length) return null;
    const ratio = focusTargetWords.value ? Math.min(0.99, currentWordCount.value / focusTargetWords.value) : 0;
    return sceneCards.value[Math.min(sceneCards.value.length - 1, Math.floor(ratio * sceneCards.value.length))];
  });
  const focusWritingGuide = computed<FocusWritingGuide>(() => {
    const chapterId = currentChapter.value?.id || currentDashboard.value?.chapterId || "";
    const card = activeSceneCard.value;
    const dashboard = currentDashboard.value;
    const nextBeat =
      card?.turn ||
      card?.conflict ||
      dashboard?.mainConflict ||
      dashboard?.endingHook ||
      "先写一个具体动作，让角色被目标、阻力或代价推着往前走。";
    const guardrails = [
      dashboard?.goal ? `目标：${dashboard.goal}` : "",
      dashboard?.pov ? `视角：${dashboard.pov}` : "",
      dashboard?.mainConflict ? `冲突：${dashboard.mainConflict}` : "",
      dashboard?.endingHook ? `钩子：${dashboard.endingHook}` : ""
    ].filter(Boolean);
    const stageLabel =
      focusProgressPercent.value >= 85
        ? "收束钩子"
        : focusProgressPercent.value >= 55
          ? "冲突升级"
          : focusProgressPercent.value >= 25
            ? "进入场景"
            : "开场落点";

    return {
      chapterId,
      targetWords: focusTargetWords.value,
      currentWords: currentWordCount.value,
      progressPercent: focusProgressPercent.value,
      stageLabel,
      sceneTitle: card?.title || currentChapter.value?.title || "当前章节",
      nextBeat,
      guardrails,
      prompt: [
        `请继续写《${currentProject.value?.title || "当前小说"}》${currentChapter.value?.title || "当前章节"}。`,
        `阶段：${stageLabel}。`,
        `下一笔：${nextBeat}`,
        guardrails.length ? `必须守住：${guardrails.join("；")}` : "",
        "要求：保持主角有限视角，用具体动作、感官和选择推进，不要提前泄露角色不知道的信息。"
      ]
        .filter(Boolean)
        .join("\n"),
      updatedAt: new Date().toISOString()
    };
  });
  const currentProjectAssets = computed(() => {
    if (!currentProject.value || !platformLibrary.value) return [];
    return platformLibrary.value.assets.filter((asset) => asset.linkedProjects.includes(currentProject.value!.slug));
  });

  function confirmDiscard(message: string) {
    if (typeof window === "undefined" || typeof window.confirm !== "function") {
      return true;
    }

    return window.confirm(message);
  }

  function canLeaveCurrentChapter() {
    return (
      !hasUnsavedChanges.value ||
      confirmDiscard("当前章节有未保存内容，切换工作台会先保留在本次会话缓存中；刷新页面前仍建议保存。是否继续？")
    );
  }

  function canLeaveCurrentSupportFile() {
    return (
      !hasUnsavedSupportChanges.value ||
      confirmDiscard("当前资料文件有未保存内容，切换工作台会先保留在本次会话缓存中；刷新页面前仍建议保存。是否继续？")
    );
  }

  function canLeaveCurrentWorkspace() {
    return canLeaveCurrentChapter() && canLeaveCurrentSupportFile();
  }

  function countDraftWords(content: string) {
    return content.replace(/\s+/g, "").length;
  }

  function compactSnippet(value: string, maxLength = 36) {
    const compacted = value.replace(/\s+/g, " ").trim();
    if (compacted.length <= maxLength) return compacted;
    return `${compacted.slice(0, maxLength)}...`;
  }

  function splitTextUnits(content: string) {
    return content
      .replace(/\r/g, "\n")
      .split(/[\n。！？!?；;]+/)
      .map((unit) => unit.replace(/\s+/g, " ").trim())
      .filter((unit) => unit.length >= 4);
  }

  function pickConflict(units: string[]) {
    return (
      units.find((unit) => /冲突|危险|代价|阻|难|必须|不能|却|但|怕|疑|选择|暴露|失去/.test(unit)) ||
      units[Math.min(1, units.length - 1)] ||
      ""
    );
  }

  function inferPov(content: string) {
    if (/我|我的|我们/.test(content)) return "第一人称视角";
    if (/他|她|少年|少女|主角|主人公/.test(content)) return "主角限知视角";
    return "待确认视角";
  }

  function inferLocation(unit: string) {
    const matched = unit.match(/(?:在|来到|走进|进入)([^，。！？!?、\s]{2,10})/);
    return matched?.[1] || "";
  }

  function inferPowerProgression(unit: string) {
    return /灵|力|术|气|法|印|修|能|境|血|咒|符/.test(unit) ? compactSnippet(unit, 30) : "";
  }

  function makeSceneCard(chapterId: string, order: number, seed: Partial<SceneCard>): SceneCard {
    const now = new Date().toISOString();
    return {
      id: `scene-${chapterId}-${now}-${order}`,
      chapterId,
      order,
      title: seed.title || `场景 ${order}`,
      time: seed.time || "",
      location: seed.location || "",
      pov: seed.pov || "主角限知视角",
      characters: seed.characters || [],
      conflict: seed.conflict || "",
      turn: seed.turn || "",
      informationReleased: seed.informationReleased || [],
      foreshadowingIds: seed.foreshadowingIds || [],
      powerProgression: seed.powerProgression || "",
      draftAnchor: seed.draftAnchor,
      updatedAt: now
    };
  }

  function buildDashboardSeed(patch: Partial<ChapterDashboard>) {
    const chapterId = currentDashboard.value?.chapterId || currentChapter.value?.id;
    if (!chapterId) return null;
    const now = new Date().toISOString();
    return {
      goal: "",
      pov: "",
      mainConflict: "",
      endingHook: "",
      wordCount: countDraftWords(currentContent.value),
      status: "empty" as ChapterDashboard["status"],
      unresolvedForeshadowingIds: [],
      continuityRiskIds: [],
      ...currentDashboard.value,
      ...patch,
      chapterId,
      updatedAt: now
    };
  }

  function applyGeneratedStructure(dashboardPatch: Partial<ChapterDashboard>, cards: SceneCard[]) {
    const dashboard = buildDashboardSeed(dashboardPatch);
    if (!dashboard) return false;
    currentDashboard.value = dashboard;
    sceneCards.value = cards;
    structureDraftVersion.value += 1;
    return true;
  }

  function buildSceneCardsFromDraft(content: string, chapterId: string) {
    const units = splitTextUnits(content);
    const beats = units.length ? units.slice(0, 5) : [content.trim()];
    return beats.map((unit, index) =>
      makeSceneCard(chapterId, index + 1, {
        title: compactSnippet(unit, 14),
        location: inferLocation(unit),
        pov: inferPov(content),
        conflict: pickConflict([unit]),
        turn: compactSnippet(unit, 42),
        powerProgression: inferPowerProgression(unit),
        draftAnchor: compactSnippet(unit, 48)
      })
    );
  }

  function buildSceneCardsFromIdea(idea: string, chapterId: string) {
    const seed = compactSnippet(idea, 28);
    const beats = [
      {
        title: "开场抓手",
        conflict: `把“${seed}”落成一个具体异常或目标。`,
        turn: "主角被迫进入本章问题，不能只旁观。"
      },
      {
        title: "冲突升级",
        conflict: "让目标受阻，并暴露代价、限制或误判。",
        turn: "主角得到线索，但同时付出更明确的风险。"
      },
      {
        title: "钩子落点",
        conflict: "用一个新问题逼出下一步行动。",
        turn: "结尾留下会牵引下一章的反应、选择或后果。"
      }
    ];
    return beats.map((beat, index) =>
      makeSceneCard(chapterId, index + 1, {
        ...beat,
        pov: "主角限知视角",
        draftAnchor: idea
      })
    );
  }

  function extractJsonText(value: string) {
    const trimmed = value.trim();
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    return fenced ? fenced[1].trim() : trimmed;
  }

  function parseJsonObject(value: unknown): Record<string, unknown> | null {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    if (typeof value !== "string" || !value.trim()) return null;
    try {
      const parsed = JSON.parse(extractJsonText(value));
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }

  function textField(source: Record<string, unknown>, key: string, maxLength = 800) {
    const value = source[key];
    if (typeof value !== "string") return "";
    return value.trim().slice(0, maxLength);
  }

  function arrayField(source: Record<string, unknown>, key: string) {
    const value = source[key];
    if (!Array.isArray(value)) return [];
    return value.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 12);
  }

  function statusField(value: unknown, fallback: ChapterDashboard["status"]): ChapterDashboard["status"] {
    const allowed: ChapterDashboard["status"][] = ["empty", "planned", "drafting", "drafted", "reviewing", "checked"];
    return allowed.includes(value as ChapterDashboard["status"]) ? (value as ChapterDashboard["status"]) : fallback;
  }

  function parseReverseStructureResult(content: unknown, chapterId: string) {
    const parsed = parseJsonObject(content) as ReverseStructurePayload | null;
    if (!parsed) return null;

    const dashboardSource =
      parsed.dashboard && typeof parsed.dashboard === "object" && !Array.isArray(parsed.dashboard)
        ? (parsed.dashboard as Record<string, unknown>)
        : (parsed as Record<string, unknown>);
    const sceneSources = Array.isArray(parsed.scenes) ? parsed.scenes : Array.isArray(parsed.sceneCards) ? parsed.sceneCards : [];
    const cards = sceneSources
      .filter((scene): scene is Record<string, unknown> => Boolean(scene && typeof scene === "object" && !Array.isArray(scene)))
      .map((scene, index) =>
        makeSceneCard(chapterId, index + 1, {
          title: textField(scene, "title", 160) || `场景 ${index + 1}`,
          time: textField(scene, "time", 160),
          location: textField(scene, "location", 180),
          pov: textField(scene, "pov", 180) || textField(dashboardSource, "pov", 180),
          characters: arrayField(scene, "characters"),
          conflict: textField(scene, "conflict"),
          turn: textField(scene, "turn"),
          informationReleased: arrayField(scene, "informationReleased"),
          foreshadowingIds: arrayField(scene, "foreshadowingIds"),
          powerProgression: textField(scene, "powerProgression"),
          draftAnchor: textField(scene, "draftAnchor", 240)
        })
      );

    if (!cards.length) return null;

    return {
      dashboardPatch: {
        goal: textField(dashboardSource, "goal"),
        pov: textField(dashboardSource, "pov"),
        mainConflict: textField(dashboardSource, "mainConflict"),
        endingHook: textField(dashboardSource, "endingHook"),
        status: statusField(dashboardSource.status, countDraftWords(currentContent.value) > 80 ? "drafted" : "drafting")
      },
      cards
    };
  }

  function clampScore(score: number) {
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  function countMatches(content: string, pattern: RegExp) {
    return content.match(pattern)?.length || 0;
  }

  function scoreMetric(score: number, strongNote: string, weakNote: string) {
    const finalScore = clampScore(score);
    return {
      score: finalScore,
      note: finalScore >= 72 ? strongNote : weakNote
    };
  }

  function chapterOrdinal(project: NovelProject | null, chapter: NovelChapter | null): number | undefined {
    if (!chapter) return undefined;
    if (typeof chapter.order === "number" && chapter.order > 0) return chapter.order;
    const index = project?.chapters.findIndex((item) => item.id === chapter.id) ?? -1;
    if (index >= 0) return index + 1;
    const digitMatch = `${chapter.id} ${chapter.title}`.match(/(\d+)/);
    return digitMatch ? Number(digitMatch[1]) : undefined;
  }

  function macroPacingGuardrails(content: string, ordinal?: number): string[] {
    if (ordinal && ordinal > 12) return [];
    const revealOverload = countMatches(content, /真相|秘密|来历|身份|规则|幕后|答案|原来|全部|彻底|终于明白/g);
    const finalitySignals = countMatches(content, /真相大白|尘埃落定|彻底解决|再无阻碍|完全掌握|洗清|平反|终结|结束了/g);
    const cleanExitSignals = countMatches(content, /敌人退去|反派退去|毫无代价|没有代价|轻易解决|直接解决|不再威胁/g);
    const risks: string[] = [];
    if (revealOverload >= 5) risks.push("前期真相释放过载，建议只揭一角，把答案拆成后续章节的代价和误判。");
    if (finalitySignals >= 2) risks.push("前期出现终局感表达，建议保留未解压力，避免让主线问题过早落地。");
    if (cleanExitSignals >= 1) risks.push("核心阻力退场过轻，建议补上代价、伤痕或新的追索关系。");
    return risks;
  }

  function currentNarrativeDebtRisks() {
    const chapterId = currentChapter.value?.id || currentDashboard.value?.chapterId;
    if (!chapterId) return [];
    const openLedgers = ledgerEntries.value.filter((entry) => entry.status !== "resolved" && entry.chapterIds.includes(chapterId));
    const dashboardDebtCount =
      (currentDashboard.value?.unresolvedForeshadowingIds.length || 0) + (currentDashboard.value?.continuityRiskIds.length || 0);
    const openLoopCount = (currentChapterSummary.value?.emotionLedger?.openLoops || []).filter((item) => item.status !== "resolved").length;
    const riskCount = openLedgers.filter((entry) => entry.kind === "risk" || entry.kind === "continuity" || entry.status === "blocked").length;
    const warnings: string[] = [];
    if (openLedgers.length + dashboardDebtCount >= 3) warnings.push("叙事债务积压偏高，建议下一章优先交付一个伏笔、风险或明确延期。");
    if (riskCount) warnings.push("存在未解决风险/连续性账本，写作前需要确认角色已知信息和状态锁。");
    if (openLoopCount) warnings.push("情绪 open loop 尚未消化，下一场景需要给角色反应、压抑或转化。");
    return warnings;
  }

  async function diagnoseCurrentChapter() {
    const chapterId = currentChapter.value?.id || currentDashboard.value?.chapterId;
    const content = currentContent.value.trim();
    if (!chapterId || !content || !canDiagnoseChapter.value) return false;

    const units = splitTextUnits(content);
    const wordCount = countDraftWords(content);
    const averageUnitLength = units.length ? wordCount / units.length : wordCount;
    const conflictCount = countMatches(content, /冲突|危险|代价|必须|不能|却|但|暴露|失去|选择|逼|阻/g);
    const emotionCount = countMatches(content, /怒|怕|惊|痛|悔|冷|热|心|沉默|犹豫|颤|笑|哭|恨/g);
    const sensoryCount = countMatches(content, /看|听|闻|触|风|雨|血|光|影|声|冷|热|疼|黑|亮/g);
    const infoCount = countMatches(content, /知道|发现|明白|秘密|线索|真相|身份|规则|封印|来历/g);
    const hookCount = countMatches(units[units.length - 1] || "", /？|\?|却|但|忽然|突然|出现|回应|门|影|声|血|选择/g);
    const abstractCount = countMatches(content, /命运|世界|强大|震撼|恐怖|可怕|无比|极其|非常|深深/g);

    const rhythm = scoreMetric(
      88 - Math.abs(averageUnitLength - 28) * 1.6,
      "句段长度有变化，阅读推进感较稳。",
      "句段节奏偏单一，适合拆出动作、反应和停顿。"
    );
    const conflict = scoreMetric(
      45 + conflictCount * 13,
      "阻力和代价已经进入文本。",
      "冲突信号偏弱，需要让主角面对明确阻力。"
    );
    const emotion = scoreMetric(
      42 + emotionCount * 7 + sensoryCount * 3,
      "情绪与感官描写能支撑场面。",
      "情绪还偏外部，可以补角色的犹豫、压抑或身体反应。"
    );
    const information = scoreMetric(
      48 + infoCount * 9,
      "本章有信息释放，读者能获得推进。",
      "信息推进偏少，可以安排一个新线索或规则露面。"
    );
    const prose = scoreMetric(
      82 - abstractCount * 6 + sensoryCount * 2,
      "文字有具体画面，AI 味不重。",
      "抽象判断词偏多，建议换成动作、感官和选择。"
    );
    const hook = scoreMetric(
      50 + hookCount * 18,
      "结尾具备翻页牵引。",
      "结尾钩子偏平，可以留下新问题、后果或未完成选择。"
    );
    const tension = scoreMetric(
      conflict.score * 0.35 + emotion.score * 0.25 + hook.score * 0.25 + rhythm.score * 0.15,
      "情节、情绪、节奏和钩子形成了有效张力。",
      "张力链条偏松，建议把阻力、代价、情绪反应和结尾悬念串成同一个压力源。"
    );

    const metrics = [
      { key: "rhythm" as const, label: "节奏", ...rhythm },
      { key: "conflict" as const, label: "冲突", ...conflict },
      { key: "emotion" as const, label: "情绪", ...emotion },
      { key: "information" as const, label: "信息", ...information },
      { key: "prose" as const, label: "文笔", ...prose },
      { key: "hook" as const, label: "钩子", ...hook },
      { key: "tension" as const, label: "张力", ...tension }
    ];
    const macroPacingRisks = macroPacingGuardrails(content, chapterOrdinal(currentProject.value, currentChapter.value));
    const narrativeDebtRisks = currentNarrativeDebtRisks();
    if (macroPacingRisks.length) {
      const informationMetric = metrics.find((metric) => metric.key === "information");
      if (informationMetric) {
        informationMetric.score = clampScore(informationMetric.score - macroPacingRisks.length * 8);
        informationMetric.note = `${informationMetric.note} 宏观节奏风险：${macroPacingRisks[0]}`;
      }
    }
    if (narrativeDebtRisks.length) {
      const tensionMetric = metrics.find((metric) => metric.key === "tension");
      if (tensionMetric) {
        tensionMetric.score = clampScore(tensionMetric.score - narrativeDebtRisks.length * 5);
        tensionMetric.note = `${tensionMetric.note} 叙事债务：${narrativeDebtRisks[0]}`;
      }
    }
    const overallScore = clampScore(metrics.reduce((sum, metric) => sum + metric.score, 0) / metrics.length);
    const lowMetrics = [...metrics].sort((left, right) => left.score - right.score).slice(0, 2);
    const highMetrics = metrics.filter((metric) => metric.score >= 72).slice(0, 2);
    const fixes = [...lowMetrics.map((metric) => `${metric.label}：${metric.note}`), ...macroPacingRisks.map((risk) => `宏观节奏：${risk}`)];

    fixes.push(...narrativeDebtRisks.map((risk) => `叙事债务：${risk}`));

    const report: ChapterQualityReport = {
      chapterId,
      overallScore,
      summary:
        overallScore >= 75
          ? "这一章的基础驱动力已经成立，下一步重点是把亮点写得更锋利。"
          : "这一章有可用骨架，但还需要补强读者继续读下去的压力和质感。",
      metrics,
      strengths: highMetrics.length ? highMetrics.map((metric) => `${metric.label}：${metric.note}`) : ["已有正文基础，可以继续向冲突和钩子集中。"],
      fixes,
      updatedAt: new Date().toISOString()
    };
    currentQualityReport.value = report;
    if (currentProject.value) {
      const saved = await novelApi.saveChapterQualityReport(currentProject.value.slug, report);
      currentQualityReport.value = saved.report;
      currentSeriesQualityMetrics.value = saved.seriesMetrics;
      await loadCreationRuntimeSnapshot(chapterId);
    }
    return true;
  }

  function wait(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function updateStyleTone(tone: StyleToneKey) {
    styleTone.value = tone;
  }

  function removeOverstatement(content: string) {
    return content
      .replace(/非常|特别|极其|无比|简直|震撼|恐怖/g, "")
      .replace(/！！+/g, "。")
      .replace(/!+/g, "。")
      .replace(/\s+/g, " ")
      .trim();
  }

  function tuneText(content: string, tone: StyleToneKey) {
    const clean = removeOverstatement(content);
    const ending = /[。！？!?]$/.test(clean) ? "" : "。";
    switch (tone) {
      case "restrained":
        return `${clean}${ending}`.replace(/他终于明白/g, "他没有再问").replace(/她终于明白/g, "她没有再问");
      case "tense":
        return `${clean}${ending}\n他没有立刻动。那一点迟疑，反而让危险显得更近。`;
      case "cinematic":
        return `${clean}${ending}\n风声压低，光影贴着地面滑过去，像有什么东西刚从画面外经过。`;
      case "web-serial":
        return `${clean}${ending}\n这一次，他要么抓住线索，要么把自己也赔进去。`;
      case "lower-ai":
        return clean
          .replace(/命运/g, "眼前这一步")
          .replace(/世界/g, "这片地方")
          .replace(/强大/g, "难以撼动")
          .replace(/可怕/g, "让人不敢靠近");
      case "elegant":
      default:
        return `${clean}${ending}\n沉默落下来时，细微的声响反而清晰起来，像一根线，把他牵向尚未显形的答案。`;
    }
  }

  function tuneSelectionStyle(tone: StyleToneKey = styleTone.value) {
    const selectionAnchor = selection.value;
    if (!selectionAnchor?.selectedText.trim()) return false;
    styleTone.value = tone;
    rewriteCandidate.value = {
      summary: `文风调音：${styleToneLabels[tone]}`,
      content: tuneText(selectionAnchor.selectedText, tone),
      changes: [`调整为${styleToneLabels[tone]}`, "压低空泛判断，强化画面、动作或压力"],
      risks: [],
      questions: ["接受前建议确认：这段是否仍然符合当前 POV 和角色性格。"],
      patches: []
    };
    rewriteSelection.value = cloneSelection(selectionAnchor);
    return true;
  }

  const styleToneLabels: Record<StyleToneKey, string> = {
    elegant: "优雅留白",
    restrained: "克制冷峻",
    tense: "压迫感",
    cinematic: "镜头感",
    "web-serial": "网文爽感",
    "lower-ai": "降低 AI 味"
  };

  function syncDashboardWordCount(content = currentContent.value) {
    if (!currentDashboard.value) return;
    currentDashboard.value = {
      ...currentDashboard.value,
      wordCount: countDraftWords(content),
      updatedAt: new Date().toISOString()
    };
  }

  function parseRecapCandidate(content?: string) {
    if (!content) return null;

    try {
      const parsed = JSON.parse(content) as Partial<WritingRecapCandidate>;
      if (!parsed || typeof parsed.summary !== "string" || !parsed.chapterId) return null;
      return {
        chapterId: parsed.chapterId,
        summary: parsed.summary,
        newFacts: Array.isArray(parsed.newFacts) ? parsed.newFacts : [],
        characterStateChanges: Array.isArray(parsed.characterStateChanges) ? parsed.characterStateChanges : [],
        foreshadowingUpdates: Array.isArray(parsed.foreshadowingUpdates) ? parsed.foreshadowingUpdates : [],
        continuityRisks: Array.isArray(parsed.continuityRisks) ? parsed.continuityRisks : [],
        powerProgressionUpdates: Array.isArray(parsed.powerProgressionUpdates) ? parsed.powerProgressionUpdates : [],
        createdAt: parsed.createdAt || new Date().toISOString(),
        summaryPatch: parsed.summaryPatch,
        emotionLedgerPatch: parsed.emotionLedgerPatch,
        factPatches: Array.isArray(parsed.factPatches) ? parsed.factPatches : undefined,
        ledgerPatches: Array.isArray(parsed.ledgerPatches) ? parsed.ledgerPatches : undefined,
        characterStatePatches: Array.isArray(parsed.characterStatePatches) ? parsed.characterStatePatches : undefined,
        riskPatches: Array.isArray(parsed.riskPatches) ? parsed.riskPatches : undefined
      };
    } catch {
      return null;
    }
  }

  function taskSortTime(task: NovelTask) {
    return Date.parse(task.finishedAt || task.cancelRequestedAt || task.startedAt || "") || 0;
  }

  function isTerminalTask(task: NovelTask) {
    return task.status === "success" || task.status === "error" || task.status === "cancelled";
  }

  function upsertTaskHistory(task: NovelTask) {
    const existingIndex = taskHistory.value.findIndex((item) => item.id === task.id);
    if (existingIndex >= 0) {
      taskHistory.value.splice(existingIndex, 1, task);
    } else {
      taskHistory.value.unshift(task);
    }
    taskHistory.value = [...taskHistory.value].sort((left, right) => taskSortTime(right) - taskSortTime(left));
  }

  async function loadTaskHistory() {
    if (!currentProject.value) return;
    try {
      taskHistory.value = await novelApi.listTasks(currentProject.value.slug);
    } catch {
      taskHistory.value = [];
    }
  }

  async function loadAiInvocations() {
    if (!currentProject.value) return;
    try {
      aiInvocations.value = await novelApi.readAiInvocations(currentProject.value.slug);
    } catch {
      aiInvocations.value = [];
    }
  }

  async function loadBackgroundJobs() {
    if (!currentProject.value) return;
    try {
      backgroundJobs.value = await novelApi.listBackgroundJobs(currentProject.value.slug);
    } catch {
      backgroundJobs.value = [];
    }
  }

  async function refreshAiInvocations() {
    if (!currentProject.value) return;
    try {
      aiInvocations.value = await novelApi.readAiInvocations(currentProject.value.slug);
    } catch {
      // Keep the completed task visible even if the audit log cannot be refreshed.
    }
  }

  function startTaskProgress(type: CodexTaskType | null = null) {
    activeTaskType.value = type;
    const agentLabel = currentProject.value?.ai?.profileId === "claude-code" ? "调用 Claude Code CLI" : "调用 AI 执行器";
    taskProgress.value = [
      { id: "context", label: "准备项目上下文", status: "running" },
      { id: "codex", label: agentLabel, status: "pending" },
      { id: "parse", label: "解析结构化结果", status: "pending" }
    ];
  }

  function setTaskProgress(id: string, status: TaskProgressStep["status"]) {
    taskProgress.value = taskProgress.value.map((step) => (step.id === id ? { ...step, status } : step));
  }

  function cloneSelection(anchor: EditorSelection): EditorSelection {
    return { ...anchor };
  }

  function withSelectionPatchAnchors(patches: NovelFilePatch[]) {
    const anchor = rewriteSelection.value || selection.value;
    if (!anchor) return patches;

    return patches.map((patch) => {
      if (patch.mode !== "replace-selection" || patch.selection || patch.target !== anchor.filePath) {
        return patch;
      }

      return {
        ...patch,
        selection: {
          start: anchor.start,
          end: anchor.end
        }
      };
    });
  }

  function finishTaskProgress(success: boolean) {
    const fallbackStatus = success ? "done" : "error";
    taskProgress.value = taskProgress.value.map((step) => ({
      ...step,
      status: step.status === "done" ? "done" : fallbackStatus
    }));
  }

  function resetActiveWorkspace() {
    currentProject.value = null;
    currentChapter.value = null;
    currentDocumentKind.value = "content";
    currentFilePath.value = "";
    currentContent.value = "";
    savedContent.value = "";
    lastSavedAt.value = "";
    selection.value = null;
    rewriteSelection.value = null;
    currentTask.value = null;
    activeTaskType.value = null;
    taskProgress.value = [];
    taskHistory.value = [];
    aiInvocations.value = [];
    backgroundJobs.value = [];
    rewriteCandidate.value = null;
    recapCandidate.value = null;
    currentQualityReport.value = null;
    currentSeriesQualityMetrics.value = null;
    styleTone.value = "elegant";
    focusTargetWords.value = DEFAULT_FOCUS_TARGET_WORDS;
    focusDraftInstruction.value = "";
    currentDashboard.value = null;
    currentChapterSummary.value = null;
    currentRuntimeSnapshot.value = null;
    sceneCards.value = [];
    storyControl.value = null;
    storyGraph.value = null;
    knowledgeIndex.value = null;
    knowledgeSearchResult.value = null;
    auditReportPreview.value = null;
    fileVersions.value = [];
    currentFileDiff.value = null;
    isLoadingFileVersions.value = false;
    isLoadingFileDiff.value = false;
    savePipelineSteps.value = [];
    isRunningSavePipeline.value = false;
    structureIdeaInput.value = "";
    structureDraftVersion.value = 0;
    activeLedgerKind.value = "foreshadowing";
    ledgerEntries.value = [];
    writingMode.value = "structure";
    supportContent.value = "";
    savedSupportContent.value = "";
  }

  function cacheCurrentWorkspace() {
    if (!currentProject.value) return;

    workspaceCache.value = {
      ...workspaceCache.value,
      [currentProject.value.slug]: {
        project: currentProject.value,
        chapterId: currentChapter.value?.id || null,
        documentKind: currentDocumentKind.value,
        filePath: currentFilePath.value,
        content: currentContent.value,
        savedContent: savedContent.value,
        lastSavedAt: lastSavedAt.value,
        selection: selection.value,
        rewriteSelection: rewriteSelection.value,
        currentTask: currentTask.value,
        taskProgress: taskProgress.value,
        taskHistory: taskHistory.value,
        aiInvocations: aiInvocations.value,
        rewriteCandidate: rewriteCandidate.value,
        recapCandidate: recapCandidate.value,
        qualityReport: currentQualityReport.value,
        seriesQualityMetrics: currentSeriesQualityMetrics.value,
        styleTone: styleTone.value,
        focusTargetWords: focusTargetWords.value,
        focusDraftInstruction: focusDraftInstruction.value,
        dashboard: currentDashboard.value,
        chapterSummary: currentChapterSummary.value,
        runtimeSnapshot: currentRuntimeSnapshot.value,
        sceneCards: sceneCards.value,
        storyControl: storyControl.value,
        storyGraph: storyGraph.value,
        knowledgeIndex: knowledgeIndex.value,
        structureIdeaInput: structureIdeaInput.value,
        structureDraftVersion: structureDraftVersion.value,
        ledgerKind: activeLedgerKind.value,
        ledgerEntries: ledgerEntries.value,
        writingMode: writingMode.value,
        supportPath: currentSupportPath.value,
        supportContent: supportContent.value,
        savedSupportContent: savedSupportContent.value
      }
    };
  }

  function restoreCachedWorkspace(project: NovelProject) {
    const cached = workspaceCache.value[project.slug];
    if (!cached) return false;

    currentProject.value = project;
    currentChapter.value = project.chapters.find((chapter) => chapter.id === cached.chapterId) || project.chapters[0] || null;
    currentDocumentKind.value = cached.documentKind;
    currentFilePath.value = cached.filePath;
    currentContent.value = cached.content;
    savedContent.value = cached.savedContent;
    lastSavedAt.value = cached.lastSavedAt;
    selection.value = cached.selection;
    rewriteSelection.value = cached.rewriteSelection || null;
    currentTask.value = cached.currentTask;
    taskProgress.value = cached.taskProgress;
    taskHistory.value = cached.taskHistory;
    aiInvocations.value = cached.aiInvocations || [];
    rewriteCandidate.value = cached.rewriteCandidate;
    recapCandidate.value = cached.recapCandidate;
    currentQualityReport.value = cached.qualityReport || null;
    currentSeriesQualityMetrics.value = cached.seriesQualityMetrics || null;
    styleTone.value = cached.styleTone || "elegant";
    focusTargetWords.value = cached.focusTargetWords || DEFAULT_FOCUS_TARGET_WORDS;
    focusDraftInstruction.value = cached.focusDraftInstruction || "";
    currentDashboard.value = cached.dashboard;
    currentChapterSummary.value = cached.chapterSummary || null;
    currentRuntimeSnapshot.value = cached.runtimeSnapshot || null;
    sceneCards.value = cached.sceneCards;
    storyControl.value = cached.storyControl;
    storyGraph.value = cached.storyGraph || null;
    knowledgeIndex.value = cached.knowledgeIndex || null;
    structureIdeaInput.value = cached.structureIdeaInput || "";
    structureDraftVersion.value = cached.structureDraftVersion || 0;
    activeLedgerKind.value = cached.ledgerKind;
    ledgerEntries.value = cached.ledgerEntries;
    writingMode.value = cached.writingMode || "structure";
    currentSupportPath.value = cached.supportPath;
    supportContent.value = cached.supportContent;
    savedSupportContent.value = cached.savedSupportContent;
    return true;
  }

  async function loadProjects() {
    projects.value = await novelApi.listProjects();
    openWorkspaceSlugs.value = openWorkspaceSlugs.value.filter((slug) =>
      projects.value.some((project) => project.slug === slug)
    );
  }

  async function loadPlatformLibrary() {
    platformLibrary.value = await novelApi.readPlatformLibrary();
  }

  async function loadAiStages() {
    aiStages.value = await novelApi.readAiStages();
  }

  async function loadAgentProfiles() {
    const data = await novelApi.readAgentProfiles();
    agentProfiles.value = data.profiles;
    agentChecks.value = data.checks;
    defaultAgentProfileId.value = data.defaultProfileId;
  }

  async function loadPlatformAiConfig() {
    platformAiConfig.value = await novelApi.readPlatformAiConfig();
  }

  async function checkAgentProfile(profileId: string, modelId?: string) {
    const result = await novelApi.checkAgentProfile(profileId, modelId);
    agentChecks.value = [...agentChecks.value.filter((item) => item.profileId !== result.profileId), result];
    return result;
  }

  async function updateProjectAiConfig(input: { profileId: string; modelId?: string }) {
    if (!currentProject.value) return null;
    isSavingAiConfig.value = true;
    try {
      const project = await novelApi.updateProjectAiConfig(currentProject.value.slug, input);
      currentProject.value = project;
      projects.value = projects.value.map((item) => (item.slug === project.slug ? project : item));
      if (workspaceCache.value[project.slug]) {
        workspaceCache.value[project.slug] = {
          ...workspaceCache.value[project.slug],
          project
        };
      }
      return project;
    } finally {
      isSavingAiConfig.value = false;
    }
  }

  async function savePlatformAiConfig(config: PlatformAiConfig) {
    isSavingAiConfig.value = true;
    try {
      platformAiConfig.value = await novelApi.savePlatformAiConfig(config);
      return platformAiConfig.value;
    } finally {
      isSavingAiConfig.value = false;
    }
  }

  async function createProject(input: { title?: string; genre?: string; roughIdea: string }) {
    if (!canLeaveCurrentWorkspace()) return;

    isLoading.value = true;
    error.value = "";
    try {
      const project = await novelApi.createProject(input);
      projects.value = [project, ...projects.value.filter((item) => item.slug !== project.slug)];
      await openProject(project);
      return project;
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      isLoading.value = false;
    }
  }

  async function importProject(input: {
    sourcePath: string;
    title?: string;
    genre?: string;
    roughIdea?: string;
    files?: Array<{ relativePath: string; content: string }>;
  }) {
    if (!canLeaveCurrentWorkspace()) return;

    isLoading.value = true;
    error.value = "";
    try {
      const project = await novelApi.importProject(input);
      projects.value = [project, ...projects.value.filter((item) => item.slug !== project.slug)];
      await openProject(project);
      return project;
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      isLoading.value = false;
    }
  }

  async function deleteProject(project: NovelProject) {
    isLoading.value = true;
    error.value = "";
    try {
      await novelApi.deleteProject(project.slug);
      projects.value = projects.value.filter((item) => item.slug !== project.slug);
      openWorkspaceSlugs.value = openWorkspaceSlugs.value.filter((slug) => slug !== project.slug);
      const { [project.slug]: _deletedWorkspace, ...restCache } = workspaceCache.value;
      workspaceCache.value = restCache;
      if (currentProject.value?.slug === project.slug) {
        resetActiveWorkspace();
      }
      return true;
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      isLoading.value = false;
    }
  }

  async function createSharedAsset(input: {
    name: string;
    type?: PlatformAssetType;
    tags?: string[];
    filePath?: string;
    projectSlug?: string;
  }) {
    const asset = await novelApi.createPlatformAsset({
      ...input,
      scope: "shared",
      projectSlug: input.projectSlug || currentProject.value?.slug
    });
    await loadPlatformLibrary();
    return asset;
  }

  async function linkSharedAsset(asset: PlatformAsset) {
    if (!currentProject.value) return;
    const linked = await novelApi.linkPlatformAsset(asset.id, currentProject.value.slug);
    if (platformLibrary.value) {
      platformLibrary.value = {
        ...platformLibrary.value,
        assets: platformLibrary.value.assets.map((item) => (item.id === linked.id ? linked : item))
      };
    } else {
      await loadPlatformLibrary();
    }
  }

  async function loadChapterCockpit(chapterId: string) {
    if (!currentProject.value) return;
    const [dashboard, cards, summary, qualityReport, runtimeSnapshot, seriesQualityMetrics] = await Promise.all([
      novelApi.readChapterDashboard(currentProject.value.slug, chapterId),
      novelApi.readSceneCards(currentProject.value.slug, chapterId),
      novelApi.readChapterSummary(currentProject.value.slug, chapterId),
      novelApi.readChapterQualityReport(currentProject.value.slug, chapterId),
      novelApi.readCreationRuntimeSnapshot(currentProject.value.slug, chapterId),
      novelApi.readSeriesQualityMetrics(currentProject.value.slug)
    ]);
    currentDashboard.value = {
      ...dashboard,
      wordCount: countDraftWords(currentContent.value)
    };
    sceneCards.value = cards;
    currentChapterSummary.value = summary;
    currentQualityReport.value = qualityReport;
    currentRuntimeSnapshot.value = runtimeSnapshot;
    currentSeriesQualityMetrics.value = seriesQualityMetrics;
  }

  async function loadSeriesQualityMetrics() {
    if (!currentProject.value) return;
    currentSeriesQualityMetrics.value = await novelApi.readSeriesQualityMetrics(currentProject.value.slug);
  }

  async function loadCreationRuntimeSnapshot(chapterId = currentChapter.value?.id || currentDashboard.value?.chapterId) {
    if (!currentProject.value || !chapterId) return;
    currentRuntimeSnapshot.value = await novelApi.readCreationRuntimeSnapshot(currentProject.value.slug, chapterId);
  }

  async function loadStoryControl() {
    if (!currentProject.value) return;
    storyControl.value = await novelApi.readStoryControl(currentProject.value.slug);
  }

  async function loadStoryGraph() {
    if (!currentProject.value) return;
    try {
      storyGraph.value = await novelApi.readStoryGraph(currentProject.value.slug);
    } catch {
      storyGraph.value = null;
    }
  }

  async function loadKnowledgeIndex() {
    if (!currentProject.value) return;
    try {
      knowledgeIndex.value = await novelApi.readKnowledgeIndex(currentProject.value.slug);
    } catch {
      knowledgeIndex.value = null;
    }
  }

  async function rebuildKnowledgeIndex() {
    if (!currentProject.value) return;
    isRebuildingKnowledgeIndex.value = true;
    try {
      const projectId = currentProject.value.slug;
      await runCurrentProjectBackgroundJob("knowledge.index.rebuild", { source: "workspace" }, "知识索引重建失败");
      knowledgeIndex.value = await novelApi.readKnowledgeIndex(projectId);
      knowledgeSearchResult.value = null;
      await loadStoryGraph();
    } finally {
      isRebuildingKnowledgeIndex.value = false;
    }
  }

  async function rebuildSeriesQualityMetrics() {
    if (!currentProject.value) return;
    isRebuildingSeriesQualityMetrics.value = true;
    try {
      const projectId = currentProject.value.slug;
      await runCurrentProjectBackgroundJob("quality.series.rebuild", { source: "workspace" }, "全书质量指标重建失败");
      currentSeriesQualityMetrics.value = await novelApi.readSeriesQualityMetrics(projectId);
    } finally {
      isRebuildingSeriesQualityMetrics.value = false;
    }
  }

  async function rebuildStoryGraph() {
    if (!currentProject.value) return;
    isRebuildingStoryGraph.value = true;
    try {
      const projectId = currentProject.value.slug;
      await runCurrentProjectBackgroundJob("story.graph.rebuild", { source: "workspace" }, "故事图谱重建失败");
      storyGraph.value = await novelApi.readStoryGraph(projectId);
    } finally {
      isRebuildingStoryGraph.value = false;
    }
  }

  async function runCurrentProjectBackgroundJob(
    type: BackgroundJobType,
    payload: Record<string, unknown>,
    errorMessage: string
  ): Promise<BackgroundJob> {
    if (!currentProject.value) {
      throw new Error("未打开项目");
    }
    const startedJob = await novelApi.startBackgroundJob(currentProject.value.slug, type, payload);
    upsertBackgroundJob(startedJob);
    const finishedJob = await waitForBackgroundJob(currentProject.value.slug, startedJob.id);
    upsertBackgroundJob(finishedJob);
    if (finishedJob.status === "error") {
      throw new Error(finishedJob.error || errorMessage);
    }
    return finishedJob;
  }

  async function enqueueCurrentProjectBackgroundJob(type: BackgroundJobType, payload: Record<string, unknown>): Promise<BackgroundJob> {
    if (!currentProject.value) {
      throw new Error("鏈墦寮€椤圭洰");
    }
    const startedJob = await novelApi.startBackgroundJob(currentProject.value.slug, type, payload);
    upsertBackgroundJob(startedJob);
    return startedJob;
  }

  async function cancelBackgroundJob(jobId: string): Promise<BackgroundJob | null> {
    if (!currentProject.value) return null;
    const job = await novelApi.cancelBackgroundJob(currentProject.value.slug, jobId);
    upsertBackgroundJob(job);
    return job;
  }

  async function retryBackgroundJob(jobId: string): Promise<BackgroundJob | null> {
    if (!currentProject.value) return null;
    const startedJob = await novelApi.retryBackgroundJob(currentProject.value.slug, jobId);
    upsertBackgroundJob(startedJob);
    const finishedJob = await waitForBackgroundJob(currentProject.value.slug, startedJob.id);
    upsertBackgroundJob(finishedJob);
    return finishedJob;
  }

  function upsertBackgroundJob(job: BackgroundJob) {
    backgroundJobs.value = [job, ...backgroundJobs.value.filter((item) => item.id !== job.id)].sort(
      (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
    );
  }

  async function waitForBackgroundJob(projectId: string, jobId: string): Promise<BackgroundJob> {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const job = await novelApi.readBackgroundJob(projectId, jobId);
      upsertBackgroundJob(job);
      if (job.status === "success" || job.status === "error" || job.status === "cancelled") {
        return job;
      }
      await wait(500);
    }
    throw new Error("后台作业超时");
  }

  async function waitForTask(projectId: string, startedTask: NovelTask): Promise<NovelTask> {
    const timeoutMs = Math.max(startedTask.timeoutMs || 600_000, 60_000) + 30_000;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const task = await novelApi.readTask(projectId, startedTask.id);
      currentTask.value = task;
      upsertTaskHistory(task);
      if (isTerminalTask(task)) {
        return task;
      }
      await wait(500);
    }
    throw new Error("AI 浠诲姟杞瓒呮椂");
  }

  const savePipelineStepLabels: Record<SavePipelineStepId, string> = {
    save: "保存",
    recap: "章后回顾",
    runtime: "运行快照",
    quality: "质量重建",
    knowledge: "知识索引",
    story: "故事图谱"
  };

  const savePipelineStepOrder: SavePipelineStepId[] = ["save", "recap", "runtime", "quality", "knowledge", "story"];
  const savePipelineAfterSaveSteps: SavePipelineStepId[] = ["recap", "runtime", "quality", "knowledge", "story"];

  function makeSavePipelineSteps(): SavePipelineStep[] {
    return savePipelineStepOrder.map((id) => ({
      id,
      label: savePipelineStepLabels[id],
      status: "pending"
    }));
  }

  function setAutoRunSavePipeline(value: boolean) {
    autoRunSavePipeline.value = value;
  }

  function updateSavePipelineStep(id: SavePipelineStepId, status: SavePipelineStepStatus, detail?: string) {
    savePipelineSteps.value = savePipelineSteps.value.map((step) => (step.id === id ? { ...step, status, detail } : step));
  }

  function skipSavePipelineSteps(ids: SavePipelineStepId[], detail: string) {
    for (const id of ids) {
      updateSavePipelineStep(id, "skipped", detail);
    }
  }

  function pipelineErrorMessage(err: unknown) {
    return err instanceof Error ? err.message : String(err);
  }

  async function enqueueSavePipelineBackgroundJob(stepId: SavePipelineStepId, type: BackgroundJobType, payload: Record<string, unknown>) {
    updateSavePipelineStep(stepId, "running", "正在加入后台队列");
    try {
      const job = await enqueueCurrentProjectBackgroundJob(type, payload);
      updateSavePipelineStep(stepId, "queued", `已加入后台队列：${job.id}`);
      return job;
    } catch (err) {
      const message = pipelineErrorMessage(err);
      updateSavePipelineStep(stepId, "error", message);
      error.value = message;
      return null;
    }
  }

  async function runPostSavePipeline(previousContent = savedContent.value) {
    if (isRunningSavePipeline.value) return;
    savePipelineSteps.value = makeSavePipelineSteps();
    updateSavePipelineStep("save", "done", "当前文档已保存");

    const chapterId = currentChapter.value?.id || currentDashboard.value?.chapterId;
    if (!currentProject.value || !chapterId) {
      skipSavePipelineSteps(savePipelineAfterSaveSteps, "未打开章节");
      return;
    }

    if (currentDocumentKind.value !== "content") {
      skipSavePipelineSteps(savePipelineAfterSaveSteps, "仅章节正文保存后运行");
      return;
    }

    isRunningSavePipeline.value = true;
    let activeStep: SavePipelineStepId = "recap";
    try {
      activeStep = "recap";
      updateSavePipelineStep("recap", "running", "抽取本次保存带来的事实变化");
      const recapTask = await runTask("writing.recap", {
        mode: "chapter.save.pipeline",
        previousTail: previousContent.slice(-1600),
        currentTail: currentContent.value.slice(-1600),
        changedCharCount: Math.abs(currentContent.value.length - previousContent.length),
        instruction:
          "请只复盘本次章节保存带来的事实变化，生成可由作者确认后写入账本的 WritingRecapCandidate JSON；不要改写正文，也不要自动应用账本。"
      });
      updateSavePipelineStep("recap", "done", recapCandidate.value ? "已生成待确认回顾" : "任务完成，未解析到回顾候选");

      if (!recapTask || recapTask.status === "error" || recapTask.status === "cancelled") {
        throw new Error(recapTask?.error || (recapTask?.status === "cancelled" ? "AI 浠诲姟宸插彇娑?" : "绔犲悗鍥為【澶辫触"));
      }

      activeStep = "runtime";
      updateSavePipelineStep("runtime", "running", "刷新创作闭环快照");
      await loadCreationRuntimeSnapshot(chapterId);
      updateSavePipelineStep("runtime", "done", "运行快照已刷新");

      await Promise.all([
        enqueueSavePipelineBackgroundJob("quality", "quality.series.rebuild", { source: "save-pipeline", chapterId }),
        enqueueSavePipelineBackgroundJob("knowledge", "knowledge.index.rebuild", { source: "save-pipeline", chapterId }),
        enqueueSavePipelineBackgroundJob("story", "story.graph.rebuild", { source: "save-pipeline", chapterId })
      ]);
    } catch (err) {
      const message = pipelineErrorMessage(err);
      error.value = message;
      updateSavePipelineStep(activeStep, "error", message);
      const remaining = savePipelineAfterSaveSteps.slice(savePipelineAfterSaveSteps.indexOf(activeStep) + 1);
      skipSavePipelineSteps(remaining, "前序步骤失败后跳过");
    } finally {
      isRunningSavePipeline.value = false;
    }
  }

  async function runPostSavePipelineFromCurrentContent() {
    await runPostSavePipeline(savedContent.value);
  }

  async function searchKnowledgeIndex(query: string) {
    if (!currentProject.value) return null;
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      knowledgeSearchResult.value = null;
      return null;
    }

    isSearchingKnowledge.value = true;
    try {
      const result = await novelApi.searchKnowledgeIndex(currentProject.value.slug, {
        query: normalizedQuery,
        chapterId: currentChapter.value?.id,
        limit: 12
      });
      knowledgeSearchResult.value = result;
      return result;
    } finally {
      isSearchingKnowledge.value = false;
    }
  }

  function updateStoryControl(patch: Partial<StoryControl>) {
    if (!storyControl.value) return;
    storyControl.value = {
      ...storyControl.value,
      ...patch,
      version: 1,
      updatedAt: new Date().toISOString()
    };
  }

  async function saveStoryControl() {
    if (!currentProject.value || !storyControl.value) return;
    isSavingStoryControl.value = true;
    try {
      storyControl.value = await novelApi.saveStoryControl(currentProject.value.slug, storyControl.value);
      await loadStoryGraph();
      await loadKnowledgeIndex();
    } finally {
      isSavingStoryControl.value = false;
    }
  }

  function updateDashboard(patch: Partial<ChapterDashboard>) {
    if (!currentDashboard.value) return;
    currentDashboard.value = {
      ...currentDashboard.value,
      ...patch,
      chapterId: currentDashboard.value.chapterId,
      updatedAt: new Date().toISOString()
    };
  }

  async function saveCurrentDashboard() {
    if (!currentProject.value || !currentDashboard.value) return;
    isSavingDashboard.value = true;
    try {
      currentDashboard.value = await novelApi.saveChapterDashboard(currentProject.value.slug, currentDashboard.value);
      await loadCreationRuntimeSnapshot(currentDashboard.value.chapterId);
    } finally {
      isSavingDashboard.value = false;
    }
  }

  function updateSceneCards(cards: SceneCard[]) {
    sceneCards.value = cards;
  }

  async function saveCurrentSceneCards() {
    if (!currentProject.value || !currentChapter.value) return;
    isSavingScenes.value = true;
    try {
      sceneCards.value = await novelApi.saveSceneCards(currentProject.value.slug, currentChapter.value.id, sceneCards.value);
      await loadCreationRuntimeSnapshot(currentChapter.value.id);
    } finally {
      isSavingScenes.value = false;
    }
  }

  async function saveCurrentStructure() {
    await Promise.all([saveCurrentDashboard(), saveCurrentSceneCards()]);
  }

  function updateStructureIdeaInput(value: string) {
    structureIdeaInput.value = value;
  }

  function applyLocalReverseStructure(content: string, chapterId: string) {
    const units = splitTextUnits(content);
    const conflict = pickConflict(units);
    return applyGeneratedStructure(
      {
        goal: `反写：梳理“${compactSnippet(units[0] || content, 28)}”这一章的目标、阻力和结尾钩子。`,
        pov: inferPov(content),
        mainConflict: compactSnippet(conflict || "主角需要在目标与代价之间做选择。", 54),
        endingHook: compactSnippet(units[units.length - 1] || content, 54),
        status: countDraftWords(content) > 80 ? "drafted" : "drafting"
      },
      buildSceneCardsFromDraft(content, chapterId)
    );
  }

  async function reverseEngineerStructureFromDraft() {
    if (isReverseEngineeringStructure.value) return false;
    const content = currentContent.value.trim();
    const chapterId = currentDashboard.value?.chapterId || currentChapter.value?.id;
    if (!currentProject.value || !chapterId || !content || !canReverseEngineerStructure.value) return false;

    isReverseEngineeringStructure.value = true;
    isLoading.value = true;
    error.value = "";
    startTaskProgress("structure.reverse");
    try {
      setTaskProgress("context", "done");
      setTaskProgress("codex", "running");
      const task = await novelApi.runTask(currentProject.value.slug, "structure.reverse", {
        chapterId,
        documentKind: currentDocumentKind.value,
        filePath: currentFilePath.value,
        draftContent: content,
        existingDashboard: currentDashboard.value,
        existingSceneCards: sceneCards.value,
        storyControl: storyControl.value,
        feedback: [
          "请从当前章节正文反向分析章节结构，生成更完整的章节仪表盘和场景卡。",
          "只提取真实叙事场景，过滤标题、写作日期、版本号、Markdown 标记、导入噪声和说明文字。",
          "场景卡不能只复述短句：每张卡都要有具体冲突、转折、释放信息和正文锚点。"
        ].join("\n")
      });
      setTaskProgress("codex", "done");
      setTaskProgress("parse", "running");
      currentTask.value = task;
      taskHistory.value.unshift(task);
      await refreshAiInvocations();

      const parsed = task.result ? parseReverseStructureResult(task.result.content, chapterId) : null;
      if (!parsed || task.status === "error") {
        error.value = task.error || "AI 反写结果无法解析，已使用本地兜底结构。";
        const generated = applyLocalReverseStructure(content, chapterId);
        setTaskProgress("parse", generated ? "error" : "done");
        return generated;
      }

      rewriteCandidate.value = null;
      rewriteSelection.value = null;
      recapCandidate.value = null;
      const generated = applyGeneratedStructure(parsed.dashboardPatch, parsed.cards);
      setTaskProgress("parse", generated ? "done" : "error");
      return generated;
    } catch (err) {
      error.value = `AI 反写失败，已使用本地兜底：${err instanceof Error ? err.message : String(err)}`;
      finishTaskProgress(false);
      return applyLocalReverseStructure(content, chapterId);
    } finally {
      isReverseEngineeringStructure.value = false;
      isLoading.value = false;
    }
  }

  function generateStructureFromIdea(input = structureIdeaInput.value) {
    const idea = (input || currentProject.value?.roughIdea || currentChapter.value?.title || "").trim();
    const chapterId = currentDashboard.value?.chapterId || currentChapter.value?.id;
    if (!chapterId || !idea) return false;

    structureIdeaInput.value = idea;
    return applyGeneratedStructure(
      {
        goal: `根据想法搭建：${compactSnippet(idea, 46)}`,
        pov: "主角限知视角",
        mainConflict: "主角必须在目标、阻力和代价之间做选择。",
        endingHook: "结尾留下一个会逼迫主角进入下一步行动的问题。",
        status: "planned"
      },
      buildSceneCardsFromIdea(idea, chapterId)
    );
  }

  async function loadLedger(kind: LedgerKind = activeLedgerKind.value) {
    if (!currentProject.value) return;
    activeLedgerKind.value = kind;
    ledgerEntries.value = await novelApi.readLedgerEntries(currentProject.value.slug, kind);
  }

  async function saveLedger(kind: LedgerKind = activeLedgerKind.value, entries: LedgerEntry[] = ledgerEntries.value) {
    if (!currentProject.value) return;
    activeLedgerKind.value = kind;
    ledgerEntries.value = await novelApi.saveLedgerEntries(currentProject.value.slug, kind, entries);
  }

  function updateLedgerEntries(entries: LedgerEntry[]) {
    ledgerEntries.value = entries;
  }

  function setWritingMode(mode: WritingMode) {
    writingMode.value = mode;
  }

  function updateFocusTargetWords(value: number) {
    const nextValue = Number.isFinite(value) ? value : DEFAULT_FOCUS_TARGET_WORDS;
    focusTargetWords.value = Math.max(300, Math.min(12000, Math.round(nextValue)));
  }

  function updateFocusDraftInstruction(value: string) {
    focusDraftInstruction.value = value.slice(0, 240);
  }

  async function requestFocusDraft() {
    if (!currentProject.value || !currentChapter.value || !canRequestFocusDraft.value) return;
    const guide = focusWritingGuide.value;
    const authorInstruction = focusDraftInstruction.value.trim();
    await runTask("chapter.draft", {
      mode: "focus.next-draft",
      feedback: [
        guide.prompt,
        authorInstruction ? `作者微调指令：${authorInstruction}` : "",
        "",
        "请只生成可以直接接在当前正文后面的一段或数段候选正文。",
        "不要重写已有正文，不要输出整章，不要解释写作方法。",
        "候选正文需要自然承接当前章尾，优先推进下一笔，不要提前泄露 POV 角色不知道的信息。"
      ].join("\n"),
      focusGuide: guide,
      authorInstruction,
      appendAfterCurrentDraft: true,
      currentTail: currentContent.value.slice(-1200)
    });
  }

  async function requestFocusDraftRevision(direction: string) {
    if (!currentProject.value || !currentChapter.value || !canRequestFocusDraft.value || !rewriteCandidate.value?.content.trim()) {
      return false;
    }
    const guide = focusWritingGuide.value;
    const authorInstruction = focusDraftInstruction.value.trim();
    await runTask("chapter.draft", {
      mode: "focus.refine-draft",
      feedback: [
        guide.prompt,
        authorInstruction ? `作者微调指令：${authorInstruction}` : "",
        "",
        `请基于当前候选正文再改一版，调校方向：${direction}。`,
        "保留候选正文承接章尾和推进下一笔的功能，不要改写已有正文，不要输出整章。",
        "只输出可以直接追加到正文末尾的候选正文，不要解释写作方法。",
        "",
        "当前候选正文：",
        rewriteCandidate.value.content
      ].join("\n"),
      focusGuide: guide,
      authorInstruction,
      revisionDirection: direction,
      currentCandidate: rewriteCandidate.value.content,
      appendAfterCurrentDraft: true,
      currentTail: currentContent.value.slice(-1200)
    });
    return true;
  }

  async function requestWritingRecap() {
    if (isLoading.value) return;
    await runTask("writing.recap");
  }

  async function runCreationLoopAction(action: CreationLoopAction) {
    if (action === "open-structure") {
      setWritingMode("structure");
      return;
    }
    if (action === "open-focus") {
      setWritingMode("focus");
      return;
    }
    if (action === "open-review") {
      setWritingMode("review");
      return;
    }
    if (action === "save-draft") {
      await saveCurrentContent();
      return;
    }
    if (action === "diagnose") {
      setWritingMode("review");
      await diagnoseCurrentChapter();
      return;
    }
    if (action === "request-recap") {
      await requestWritingRecap();
      return;
    }
    if (action === "accept-recap") {
      await acceptWritingRecap();
    }
  }

  async function requestStoryOrchestration() {
    if (!currentProject.value || !storyControl.value || !canRequestStoryOrchestration.value) return;
    await runTask("idea.suggest", {
      mode: "story-control.orchestrate",
      feedback: [
        "请基于故事总控台、当前章节、角色状态、事件池、升级节奏和未回收伏笔，编排未来 3-8 章路线。",
        "输出需要说明：每章目标、参与角色、触发事件或秘境、冲突、收益、代价、升级是否可信、需要提前埋的伏笔。",
        "优先让事件由角色动机和代价触发，不要让主角无因刷副本，不要跳级，不要泄露 POV 角色尚不知道的信息。",
        "如果某个事件池条目不适合当前阶段，请明确说明原因并给出替代安排。"
      ].join("\n"),
      storyControl: storyControl.value
    });
  }

  async function acceptWritingRecap() {
    if (!currentProject.value || !recapCandidate.value) return;
    const accepted = await novelApi.acceptWritingRecap(currentProject.value.slug, recapCandidate.value);
    currentChapterSummary.value = accepted.summary;
    ledgerEntries.value = await novelApi.readLedgerEntries(currentProject.value.slug, activeLedgerKind.value);
    await rebuildKnowledgeIndex();
    await loadCreationRuntimeSnapshot(accepted.summary.chapterId);
    recapCandidate.value = null;
  }

  function rejectWritingRecap() {
    recapCandidate.value = null;
  }

  async function openProject(project: NovelProject, options: WorkspaceSwitchOptions = {}) {
    if (currentProject.value?.slug !== project.slug && !options.skipLeaveCheck && !canLeaveCurrentWorkspace()) return;

    cacheCurrentWorkspace();
    if (!openWorkspaceSlugs.value.includes(project.slug)) {
      openWorkspaceSlugs.value = [...openWorkspaceSlugs.value, project.slug];
    }

    if (restoreCachedWorkspace(project)) return;

    currentProject.value = project;
    currentDocumentKind.value = "content";
    const chapter = project.chapters.find((item) => item.id === project.lastOpenedChapterId) || project.chapters[0];
    if (chapter) {
      await openChapter(chapter, currentDocumentKind.value, { skipLeaveCheck: true });
    }
    await openSupportFile(currentSupportPath.value, { skipLeaveCheck: true });
    await loadStoryControl();
    await loadStoryGraph();
    await loadKnowledgeIndex();
    await loadLedger(activeLedgerKind.value);
    await loadTaskHistory();
    await loadAiInvocations();
    await loadBackgroundJobs();
  }

  function showProjectHub(options: WorkspaceSwitchOptions = {}) {
    if (!options.skipLeaveCheck && !canLeaveCurrentWorkspace()) return;
    cacheCurrentWorkspace();
    resetActiveWorkspace();
  }

  async function closeWorkspace(projectSlug: string, options: WorkspaceSwitchOptions = {}) {
    if (currentProject.value?.slug === projectSlug && !options.skipLeaveCheck && !canLeaveCurrentWorkspace()) return;

    openWorkspaceSlugs.value = openWorkspaceSlugs.value.filter((slug) => slug !== projectSlug);
    const { [projectSlug]: _closedWorkspace, ...restCache } = workspaceCache.value;
    workspaceCache.value = restCache;
    if (currentProject.value?.slug !== projectSlug) return;

    const nextProject = openWorkspaceProjects.value[0];
    if (nextProject) {
      await openProject(nextProject, { skipLeaveCheck: true });
      return;
    }

    resetActiveWorkspace();
  }

  async function openChapter(
    chapter: NovelChapter,
    documentKind: ChapterDocumentKind = currentDocumentKind.value,
    options: WorkspaceSwitchOptions = {}
  ) {
    if (!currentProject.value) return;
    const nextFilePath = documentKind === "outline" ? chapter.outlinePath : chapter.contentPath;
    if (currentFilePath.value !== nextFilePath && !options.skipLeaveCheck && !canLeaveCurrentChapter()) return;

    currentChapter.value = chapter;
    currentDocumentKind.value = documentKind;
    currentFilePath.value = nextFilePath;
    const content = await novelApi.readFile(currentProject.value.slug, nextFilePath);
    currentContent.value = content;
    savedContent.value = content;
    lastSavedAt.value = "";
    selection.value = null;
    rewriteSelection.value = null;
    rewriteCandidate.value = null;
    recapCandidate.value = null;
    currentQualityReport.value = null;
    fileVersions.value = [];
    currentFileDiff.value = null;
    await loadChapterCockpit(chapter.id);
  }

  async function openChapterDocument(documentKind: ChapterDocumentKind) {
    if (!currentChapter.value) return;
    if (documentKind === currentDocumentKind.value) return;
    if (hasUnsavedChanges.value) {
      await saveCurrentContent();
    }
    await openChapter(currentChapter.value, documentKind);
  }

  function updateContent(content: string) {
    currentContent.value = content;
    currentQualityReport.value = null;
    syncDashboardWordCount(content);
  }

  function updateSelection(nextSelection: EditorSelection | null) {
    selection.value = nextSelection;
  }

  async function saveCurrentContent() {
    if (!currentProject.value || !currentFilePath.value) return;
    isSavingContent.value = true;
    error.value = "";
    const previousContent = savedContent.value;
    try {
      await novelApi.saveFile(currentProject.value.slug, currentFilePath.value, currentContent.value);
      savedContent.value = currentContent.value;
      if (fileVersions.value.length) {
        await loadCurrentFileVersions();
      }
      syncDashboardWordCount();
      const hasDashboardToSave = Boolean(currentDashboard.value);
      await saveCurrentDashboard();
      if (!hasDashboardToSave) {
        await loadCreationRuntimeSnapshot();
      }
      lastSavedAt.value = new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
      if (autoRunSavePipeline.value) {
        await runPostSavePipeline(previousContent);
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      isSavingContent.value = false;
    }
  }

  async function openSupportFile(filePath: string, options: WorkspaceSwitchOptions = {}) {
    if (!currentProject.value) return;
    if (currentSupportPath.value !== filePath && !options.skipLeaveCheck && !canLeaveCurrentSupportFile()) return;

    currentSupportPath.value = filePath;
    const content = await novelApi.readFile(currentProject.value.slug, filePath);
    supportContent.value = content;
    savedSupportContent.value = content;
  }

  function updateSupportContent(content: string) {
    supportContent.value = content;
  }

  async function saveSupportContent() {
    if (!currentProject.value || !currentSupportPath.value) return;
    await novelApi.saveFile(currentProject.value.slug, currentSupportPath.value, supportContent.value);
    savedSupportContent.value = supportContent.value;
  }

  async function runTask(type: CodexTaskType, payload: Record<string, unknown> = {}) {
    if (!currentProject.value) return;
    if (type === "chapter.plan") {
      await openChapterDocument("outline");
      if (currentDocumentKind.value !== "outline") return;
    }
    if (type === "chapter.draft") {
      await openChapterDocument("content");
      if (currentDocumentKind.value !== "content") return;
    }

    isLoading.value = true;
    error.value = "";
    startTaskProgress(type);
    try {
      setTaskProgress("context", "done");
      setTaskProgress("codex", "running");
      const startedTask = await novelApi.startTask(currentProject.value.slug, type, {
        chapterId: currentChapter.value?.id,
        documentKind: currentDocumentKind.value,
        filePath: currentFilePath.value,
        ...payload
      });
      activeAsyncTaskId.value = startedTask.id;
      currentTask.value = startedTask;
      upsertTaskHistory(startedTask);

      const task = await waitForTask(currentProject.value.slug, startedTask);
      setTaskProgress("codex", "done");
      setTaskProgress("parse", "running");
      currentTask.value = task;
      upsertTaskHistory(task);
      await refreshAiInvocations();
      if (task.result) {
        if (type === "writing.recap") {
          recapCandidate.value = parseRecapCandidate(task.result.content);
          rewriteCandidate.value = null;
          rewriteSelection.value = null;
        } else if (type !== "writing.briefing") {
          rewriteCandidate.value = task.result;
          rewriteSelection.value = null;
        }
      }
      setTaskProgress("parse", task.status === "error" || task.status === "cancelled" ? "error" : "done");
      if (task.status === "error" || task.status === "cancelled") {
        error.value = task.error || (task.status === "cancelled" ? "AI 浠诲姟宸插彇娑?" : "");
      }
      return task;
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
      finishTaskProgress(false);
      throw err;
    } finally {
      isLoading.value = false;
      activeAsyncTaskId.value = null;
    }
  }

  async function cancelActiveTask() {
    if (!currentProject.value) return;
    const taskId = activeAsyncTaskId.value || (currentTask.value?.status === "running" ? currentTask.value.id : null);
    if (!taskId) return;
    const task = await novelApi.cancelTask(currentProject.value.slug, taskId);
    currentTask.value = task;
    upsertTaskHistory(task);
    if (task.status === "cancelled" || task.status === "error") {
      error.value = task.error || "AI 浠诲姟宸插彇娑?";
      finishTaskProgress(false);
      activeAsyncTaskId.value = null;
      isLoading.value = false;
    }
    return task;
  }

  async function polishSelection(mode: string) {
    if (!currentProject.value || !currentChapter.value || !selection.value) return;
    const selectionAnchor = cloneSelection(selection.value);
    isLoading.value = true;
    error.value = "";
    startTaskProgress("selection.polish");
    try {
      setTaskProgress("context", "done");
      setTaskProgress("codex", "running");
      const task = await novelApi.polishSelection(currentProject.value.slug, {
        ...selectionAnchor,
        chapterId: currentChapter.value.id,
        mode
      });
      setTaskProgress("codex", "done");
      setTaskProgress("parse", "running");
      currentTask.value = task;
      taskHistory.value.unshift(task);
      await refreshAiInvocations();
      rewriteCandidate.value = task.result || null;
      rewriteSelection.value = task.result ? selectionAnchor : null;
      setTaskProgress("parse", task.status === "error" ? "error" : "done");
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
      finishTaskProgress(false);
      throw err;
    } finally {
      isLoading.value = false;
    }
  }

  function acceptRewrite() {
    const selectionAnchor = rewriteSelection.value || selection.value;
    if (!selectionAnchor || !rewriteCandidate.value?.content) return;
    currentContent.value = `${currentContent.value.slice(0, selectionAnchor.start)}${rewriteCandidate.value.content}${currentContent.value.slice(selectionAnchor.end)}`;
    savedContent.value = savedContent.value === currentContent.value ? currentContent.value : savedContent.value;
    currentQualityReport.value = null;
    syncDashboardWordCount();
    selection.value = null;
    rewriteSelection.value = null;
    rewriteCandidate.value = null;
  }

  async function requestWritingRecapForAcceptedDraft(addition: string, previousTail: string) {
    await runTask("writing.recap", {
      mode: "focus.accepted-draft",
      acceptedDraft: addition,
      previousTail,
      currentTail: currentContent.value.slice(-1600),
      focusGuide: focusWritingGuide.value,
      instruction:
        "请只复盘本次新增候选正文带来的事实变化，生成可由作者确认后写入账本的 WritingRecapCandidate JSON；不要改写正文，也不要自动应用账本。"
    });
  }

  async function acceptFocusDraft() {
    const addition = rewriteCandidate.value?.content.trim();
    if (!addition) return false;
    const previousTail = currentContent.value.slice(-1200);
    const base = currentContent.value.replace(/\s+$/g, "");
    currentContent.value = base ? `${base}\n\n${addition}` : addition;
    currentQualityReport.value = null;
    syncDashboardWordCount();
    selection.value = null;
    rewriteSelection.value = null;
    rewriteCandidate.value = null;
    await requestWritingRecapForAcceptedDraft(addition, previousTail);
    return true;
  }

  function rejectRewrite() {
    rewriteSelection.value = null;
    rewriteCandidate.value = null;
  }

  async function applyTaskPatches() {
    if (!currentProject.value || !rewriteCandidate.value?.patches.length) return;
    if (!canLeaveCurrentChapter()) return;

    await novelApi.applyPatches(currentProject.value.slug, withSelectionPatchAnchors(rewriteCandidate.value.patches), currentTask.value?.id);
    await refreshAiInvocations();
    if (currentChapter.value) {
      await openChapter(currentChapter.value, currentDocumentKind.value);
    }
  }

  async function exportProjectAuditReport() {
    if (!currentProject.value || isExportingAuditReport.value) return false;
    isExportingAuditReport.value = true;
    try {
      const report = await novelApi.readProjectAuditReport(currentProject.value.slug);
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${currentProject.value.slug}-audit-report.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      return true;
    } catch (err) {
      error.value = `导出审计报告失败：${err instanceof Error ? err.message : String(err)}`;
      return false;
    } finally {
      isExportingAuditReport.value = false;
    }
  }

  async function previewProjectAuditReport() {
    if (!currentProject.value || isLoadingAuditReportPreview.value) return auditReportPreview.value;
    isLoadingAuditReportPreview.value = true;
    try {
      const report = await novelApi.readProjectAuditReport(currentProject.value.slug);
      auditReportPreview.value = report;
      return report;
    } catch (err) {
      error.value = `读取审计报告失败：${err instanceof Error ? err.message : String(err)}`;
      return null;
    } finally {
      isLoadingAuditReportPreview.value = false;
    }
  }

  function clearAuditReportPreview() {
    auditReportPreview.value = null;
  }

  async function loadCurrentFileVersions() {
    if (!currentProject.value || !currentFilePath.value) {
      fileVersions.value = [];
      return [];
    }
    isLoadingFileVersions.value = true;
    try {
      fileVersions.value = await novelApi.readFileVersions(currentProject.value.slug, currentFilePath.value);
      return fileVersions.value;
    } catch (err) {
      error.value = `读取版本快照失败：${err instanceof Error ? err.message : String(err)}`;
      return [];
    } finally {
      isLoadingFileVersions.value = false;
    }
  }

  async function previewCurrentFileDiff(versionId: string) {
    if (!currentProject.value || !currentFilePath.value || !versionId) return null;
    isLoadingFileDiff.value = true;
    try {
      currentFileDiff.value = await novelApi.readFileDiff(currentProject.value.slug, currentFilePath.value, versionId);
      return currentFileDiff.value;
    } catch (err) {
      error.value = `读取版本差异失败：${err instanceof Error ? err.message : String(err)}`;
      return null;
    } finally {
      isLoadingFileDiff.value = false;
    }
  }

  function clearCurrentFileDiff() {
    currentFileDiff.value = null;
  }

  async function requestEditorSuggestion(input: EditorSuggestionRequest): Promise<EditorSuggestion | null> {
    if (!currentProject.value || !currentChapter.value || !currentFilePath.value) return null;
    try {
      const suggestion = await novelApi.requestEditorSuggestion(currentProject.value.slug, {
        ...input,
        chapterId: currentChapter.value.id,
        documentKind: currentDocumentKind.value,
        filePath: currentFilePath.value
      });
      return suggestion.text.trim() ? suggestion : null;
    } catch {
      return null;
    }
  }

  return {
    projects,
    openWorkspaceSlugs,
    openWorkspaceProjects,
    workspaceCache,
    currentProject,
    currentChapter,
    currentDocumentKind,
    currentDocumentLabel,
    currentSaveStateLabel,
    currentFilePath,
    currentContent,
    isSavingContent,
    selection,
    rewriteSelection,
    activeRewriteSelection,
    currentTask,
    activeTaskType,
    taskProgress,
    taskHistory,
    aiInvocations,
    aiStages,
    backgroundJobs,
    rewriteCandidate,
    recapCandidate,
    currentQualityReport,
    styleTone,
    focusTargetWords,
    focusDraftInstruction,
    currentWordCount,
    focusProgressPercent,
    activeSceneCard,
    focusWritingGuide,
    creationLoopSteps,
    currentDashboard,
    currentChapterSummary,
    currentRuntimeSnapshot,
    currentSeriesQualityMetrics,
    sceneCards,
    storyControl,
    storyGraph,
    knowledgeIndex,
    knowledgeSearchResult,
    structureIdeaInput,
    structureDraftVersion,
    activeLedgerKind,
    ledgerEntries,
    writingMode,
    isSavingDashboard,
    isSavingScenes,
    isSavingStoryControl,
    isRebuildingKnowledgeIndex,
    isRebuildingSeriesQualityMetrics,
    isRebuildingStoryGraph,
    isSearchingKnowledge,
    isReverseEngineeringStructure,
    isExportingAuditReport,
    auditReportPreview,
    isLoadingAuditReportPreview,
    fileVersions,
    currentFileDiff,
    isLoadingFileVersions,
    isLoadingFileDiff,
    autoRunSavePipeline,
    savePipelineSteps,
    isRunningSavePipeline,
    agentProfiles,
    agentChecks,
    defaultAgentProfileId,
    isSavingAiConfig,
    platformAiConfig,
    activeNovelAiConfig,
    activeNovelAgentProfile,
    activeNovelAgentCheck,
    activeNovelAiSummary,
    platformLibrary,
    supportFiles,
    currentSupportPath,
    supportContent,
    isLoading,
    error,
    hasProject,
    hasUnsavedChanges,
    hasUnsavedSupportChanges,
    canUseSelection,
    canTuneSelection,
    canDiagnoseChapter,
    canReverseEngineerStructure,
    canRequestFocusDraft,
    canRequestStoryOrchestration,
    currentProjectAssets,
    canLeaveCurrentWorkspace,
    loadProjects,
    loadPlatformLibrary,
    loadAiStages,
    loadPlatformAiConfig,
    loadAgentProfiles,
    checkAgentProfile,
    updateProjectAiConfig,
    savePlatformAiConfig,
    createProject,
    importProject,
    deleteProject,
    createSharedAsset,
    linkSharedAsset,
    loadChapterCockpit,
    loadCreationRuntimeSnapshot,
    loadSeriesQualityMetrics,
    loadStoryControl,
    loadStoryGraph,
    loadKnowledgeIndex,
    loadBackgroundJobs,
    rebuildKnowledgeIndex,
    rebuildSeriesQualityMetrics,
    rebuildStoryGraph,
    cancelBackgroundJob,
    retryBackgroundJob,
    searchKnowledgeIndex,
    updateDashboard,
    saveCurrentDashboard,
    updateSceneCards,
    saveCurrentSceneCards,
    updateStoryControl,
    saveStoryControl,
    saveCurrentStructure,
    updateStructureIdeaInput,
    reverseEngineerStructureFromDraft,
    generateStructureFromIdea,
    loadLedger,
    saveLedger,
    updateLedgerEntries,
    setWritingMode,
    updateFocusTargetWords,
    updateFocusDraftInstruction,
    requestFocusDraft,
    requestFocusDraftRevision,
    requestStoryOrchestration,
    diagnoseCurrentChapter,
    updateStyleTone,
    tuneSelectionStyle,
    requestWritingRecap,
    runCreationLoopAction,
    acceptWritingRecap,
    rejectWritingRecap,
    openProject,
    showProjectHub,
    closeWorkspace,
    openChapter,
    openChapterDocument,
    updateContent,
    updateSelection,
    saveCurrentContent,
    openSupportFile,
    updateSupportContent,
    saveSupportContent,
    runTask,
    cancelActiveTask,
    setAutoRunSavePipeline,
    runPostSavePipeline,
    runPostSavePipelineFromCurrentContent,
    polishSelection,
    acceptRewrite,
    acceptFocusDraft,
    rejectRewrite,
    applyTaskPatches,
    exportProjectAuditReport,
    previewProjectAuditReport,
    clearAuditReportPreview,
    loadCurrentFileVersions,
    previewCurrentFileDiff,
    clearCurrentFileDiff,
    requestEditorSuggestion
  };
});
