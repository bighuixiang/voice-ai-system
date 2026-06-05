import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { novelApi } from "@/services/novelApi";
import type {
  ChapterDashboard,
  ChapterQualityReport,
  CodexTaskResult,
  CodexTaskType,
  ChapterDocumentKind,
  EditorSelection,
  FocusWritingGuide,
  LedgerEntry,
  NovelChapter,
  NovelProject,
  NovelTask,
  PlatformAsset,
  PlatformAssetType,
  PlatformLibrary,
  SceneCard,
  StyleToneKey,
  TaskProgressStep,
  WritingMode,
  WritingRecapCandidate
} from "@/types/novel";

type LedgerKind = LedgerEntry["kind"];

interface WorkspaceCache {
  project: NovelProject;
  chapterId: string | null;
  documentKind: ChapterDocumentKind;
  filePath: string;
  content: string;
  savedContent: string;
  lastSavedAt: string;
  selection: EditorSelection | null;
  currentTask: NovelTask | null;
  taskProgress: TaskProgressStep[];
  taskHistory: NovelTask[];
  rewriteCandidate: CodexTaskResult | null;
  recapCandidate: WritingRecapCandidate | null;
  qualityReport: ChapterQualityReport | null;
  styleTone: StyleToneKey;
  focusTargetWords: number;
  dashboard: ChapterDashboard | null;
  sceneCards: SceneCard[];
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
  const currentTask = ref<NovelTask | null>(null);
  const taskProgress = ref<TaskProgressStep[]>([]);
  const taskHistory = ref<NovelTask[]>([]);
  const rewriteCandidate = ref<CodexTaskResult | null>(null);
  const recapCandidate = ref<WritingRecapCandidate | null>(null);
  const currentQualityReport = ref<ChapterQualityReport | null>(null);
  const styleTone = ref<StyleToneKey>("elegant");
  const focusTargetWords = ref(2000);
  const currentDashboard = ref<ChapterDashboard | null>(null);
  const sceneCards = ref<SceneCard[]>([]);
  const structureIdeaInput = ref("");
  const structureDraftVersion = ref(0);
  const activeLedgerKind = ref<LedgerKind>("foreshadowing");
  const ledgerEntries = ref<LedgerEntry[]>([]);
  const writingMode = ref<WritingMode>("structure");
  const isSavingDashboard = ref(false);
  const isSavingScenes = ref(false);
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
  const canDiagnoseChapter = computed(() => currentDocumentKind.value === "content" && countDraftWords(currentContent.value) >= 30);
  const canReverseEngineerStructure = computed(
    () => currentDocumentKind.value === "content" && currentContent.value.replace(/\s+/g, "").length >= 20
  );
  const canRequestFocusDraft = computed(() => Boolean(currentProject.value && currentChapter.value && !isLoading.value));
  const currentWordCount = computed(() => countDraftWords(currentContent.value));
  const focusProgressPercent = computed(() => {
    if (!focusTargetWords.value) return 0;
    return clampScore((currentWordCount.value / focusTargetWords.value) * 100);
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

  function diagnoseCurrentChapter() {
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

    const metrics = [
      { key: "rhythm" as const, label: "节奏", ...rhythm },
      { key: "conflict" as const, label: "冲突", ...conflict },
      { key: "emotion" as const, label: "情绪", ...emotion },
      { key: "information" as const, label: "信息", ...information },
      { key: "prose" as const, label: "文笔", ...prose },
      { key: "hook" as const, label: "钩子", ...hook }
    ];
    const overallScore = clampScore(metrics.reduce((sum, metric) => sum + metric.score, 0) / metrics.length);
    const lowMetrics = [...metrics].sort((left, right) => left.score - right.score).slice(0, 2);
    const highMetrics = metrics.filter((metric) => metric.score >= 72).slice(0, 2);

    currentQualityReport.value = {
      chapterId,
      overallScore,
      summary:
        overallScore >= 75
          ? "这一章的基础驱动力已经成立，下一步重点是把亮点写得更锋利。"
          : "这一章有可用骨架，但还需要补强读者继续读下去的压力和质感。",
      metrics,
      strengths: highMetrics.length ? highMetrics.map((metric) => `${metric.label}：${metric.note}`) : ["已有正文基础，可以继续向冲突和钩子集中。"],
      fixes: lowMetrics.map((metric) => `${metric.label}：${metric.note}`),
      updatedAt: new Date().toISOString()
    };
    return true;
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
    if (!selection.value?.selectedText.trim()) return false;
    styleTone.value = tone;
    rewriteCandidate.value = {
      summary: `文风调音：${styleToneLabels[tone]}`,
      content: tuneText(selection.value.selectedText, tone),
      changes: [`调整为${styleToneLabels[tone]}`, "压低空泛判断，强化画面、动作或压力"],
      risks: [],
      questions: ["接受前建议确认：这段是否仍然符合当前 POV 和角色性格。"],
      patches: []
    };
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
        createdAt: parsed.createdAt || new Date().toISOString()
      };
    } catch {
      return null;
    }
  }

  function mergeLedgerEntries(existing: LedgerEntry[], updates: LedgerEntry[]) {
    const merged = new Map(existing.map((entry) => [entry.id, entry]));
    updates.forEach((entry) => {
      merged.set(entry.id, {
        ...merged.get(entry.id),
        ...entry,
        updatedAt: entry.updatedAt || new Date().toISOString()
      });
    });
    return Array.from(merged.values());
  }

  function startTaskProgress() {
    taskProgress.value = [
      { id: "context", label: "准备项目上下文", status: "running" },
      { id: "codex", label: "调用 Codex CLI", status: "pending" },
      { id: "parse", label: "解析结构化结果", status: "pending" }
    ];
  }

  function setTaskProgress(id: string, status: TaskProgressStep["status"]) {
    taskProgress.value = taskProgress.value.map((step) => (step.id === id ? { ...step, status } : step));
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
    rewriteCandidate.value = null;
    recapCandidate.value = null;
    currentQualityReport.value = null;
    styleTone.value = "elegant";
    focusTargetWords.value = 2000;
    currentDashboard.value = null;
    sceneCards.value = [];
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
        currentTask: currentTask.value,
        taskProgress: taskProgress.value,
        taskHistory: taskHistory.value,
        rewriteCandidate: rewriteCandidate.value,
        recapCandidate: recapCandidate.value,
        qualityReport: currentQualityReport.value,
        styleTone: styleTone.value,
        focusTargetWords: focusTargetWords.value,
        dashboard: currentDashboard.value,
        sceneCards: sceneCards.value,
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
    currentTask.value = cached.currentTask;
    taskProgress.value = cached.taskProgress;
    taskHistory.value = cached.taskHistory;
    rewriteCandidate.value = cached.rewriteCandidate;
    recapCandidate.value = cached.recapCandidate;
    currentQualityReport.value = cached.qualityReport || null;
    styleTone.value = cached.styleTone || "elegant";
    focusTargetWords.value = cached.focusTargetWords || 2000;
    currentDashboard.value = cached.dashboard;
    sceneCards.value = cached.sceneCards;
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

  async function importProject(input: { sourcePath: string; title?: string; genre?: string; roughIdea?: string }) {
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
    const [dashboard, cards] = await Promise.all([
      novelApi.readChapterDashboard(currentProject.value.slug, chapterId),
      novelApi.readSceneCards(currentProject.value.slug, chapterId)
    ]);
    currentDashboard.value = {
      ...dashboard,
      wordCount: countDraftWords(currentContent.value)
    };
    sceneCards.value = cards;
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

  function reverseEngineerStructureFromDraft() {
    const content = currentContent.value.trim();
    const chapterId = currentDashboard.value?.chapterId || currentChapter.value?.id;
    if (!chapterId || !content || !canReverseEngineerStructure.value) return false;

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
    const nextValue = Number.isFinite(value) ? value : 2000;
    focusTargetWords.value = Math.max(300, Math.min(12000, Math.round(nextValue)));
  }

  async function requestFocusDraft() {
    if (!currentProject.value || !currentChapter.value || !canRequestFocusDraft.value) return;
    const guide = focusWritingGuide.value;
    await runTask("chapter.draft", {
      mode: "focus.next-draft",
      feedback: [
        guide.prompt,
        "",
        "请只生成可以直接接在当前正文后面的一段或数段候选正文。",
        "不要重写已有正文，不要输出整章，不要解释写作方法。",
        "候选正文需要自然承接当前章尾，优先推进下一笔，不要提前泄露 POV 角色不知道的信息。"
      ].join("\n"),
      focusGuide: guide,
      appendAfterCurrentDraft: true,
      currentTail: currentContent.value.slice(-1200)
    });
  }

  async function requestFocusDraftRevision(direction: string) {
    if (!currentProject.value || !currentChapter.value || !canRequestFocusDraft.value || !rewriteCandidate.value?.content.trim()) {
      return false;
    }
    const guide = focusWritingGuide.value;
    await runTask("chapter.draft", {
      mode: "focus.refine-draft",
      feedback: [
        guide.prompt,
        "",
        `请基于当前候选正文再改一版，调校方向：${direction}。`,
        "保留候选正文承接章尾和推进下一笔的功能，不要改写已有正文，不要输出整章。",
        "只输出可以直接追加到正文末尾的候选正文，不要解释写作方法。",
        "",
        "当前候选正文：",
        rewriteCandidate.value.content
      ].join("\n"),
      focusGuide: guide,
      revisionDirection: direction,
      currentCandidate: rewriteCandidate.value.content,
      appendAfterCurrentDraft: true,
      currentTail: currentContent.value.slice(-1200)
    });
    return true;
  }

  async function requestWritingRecap() {
    await runTask("writing.recap");
  }

  async function acceptWritingRecap() {
    if (!currentProject.value || !recapCandidate.value) return;
    const updates = [
      ...recapCandidate.value.foreshadowingUpdates,
      ...recapCandidate.value.continuityRisks,
      ...recapCandidate.value.powerProgressionUpdates
    ];
    const updatesByKind = updates.reduce<Partial<Record<LedgerKind, LedgerEntry[]>>>((groups, entry) => {
      groups[entry.kind] = [...(groups[entry.kind] || []), entry];
      return groups;
    }, {});

    for (const [kind, entries] of Object.entries(updatesByKind) as Array<[LedgerKind, LedgerEntry[]]>) {
      const existing = kind === activeLedgerKind.value ? ledgerEntries.value : await novelApi.readLedgerEntries(currentProject.value.slug, kind);
      const saved = await novelApi.saveLedgerEntries(currentProject.value.slug, kind, mergeLedgerEntries(existing, entries));
      if (kind === activeLedgerKind.value) {
        ledgerEntries.value = saved;
      }
    }

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
    await loadLedger(activeLedgerKind.value);
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
    rewriteCandidate.value = null;
    recapCandidate.value = null;
    currentQualityReport.value = null;
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
    try {
      await novelApi.saveFile(currentProject.value.slug, currentFilePath.value, currentContent.value);
      savedContent.value = currentContent.value;
      syncDashboardWordCount();
      await saveCurrentDashboard();
      lastSavedAt.value = new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
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
    startTaskProgress();
    try {
      setTaskProgress("context", "done");
      setTaskProgress("codex", "running");
      const task = await novelApi.runTask(currentProject.value.slug, type, {
        chapterId: currentChapter.value?.id,
        documentKind: currentDocumentKind.value,
        filePath: currentFilePath.value,
        ...payload
      });
      setTaskProgress("codex", "done");
      setTaskProgress("parse", "running");
      currentTask.value = task;
      taskHistory.value.unshift(task);
      if (task.result) {
        if (type === "writing.recap") {
          recapCandidate.value = parseRecapCandidate(task.result.content);
          rewriteCandidate.value = null;
        } else if (type !== "writing.briefing") {
          rewriteCandidate.value = task.result;
        }
      }
      setTaskProgress("parse", task.status === "error" ? "error" : "done");
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
      finishTaskProgress(false);
      throw err;
    } finally {
      isLoading.value = false;
    }
  }

  async function polishSelection(mode: string) {
    if (!currentProject.value || !currentChapter.value || !selection.value) return;
    isLoading.value = true;
    error.value = "";
    startTaskProgress();
    try {
      setTaskProgress("context", "done");
      setTaskProgress("codex", "running");
      const task = await novelApi.polishSelection(currentProject.value.slug, {
        ...selection.value,
        chapterId: currentChapter.value.id,
        mode
      });
      setTaskProgress("codex", "done");
      setTaskProgress("parse", "running");
      currentTask.value = task;
      taskHistory.value.unshift(task);
      rewriteCandidate.value = task.result || null;
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
    if (!selection.value || !rewriteCandidate.value?.content) return;
    currentContent.value = `${currentContent.value.slice(0, selection.value.start)}${rewriteCandidate.value.content}${currentContent.value.slice(selection.value.end)}`;
    savedContent.value = savedContent.value === currentContent.value ? currentContent.value : savedContent.value;
    currentQualityReport.value = null;
    syncDashboardWordCount();
    selection.value = null;
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
    rewriteCandidate.value = null;
    await requestWritingRecapForAcceptedDraft(addition, previousTail);
    return true;
  }

  function rejectRewrite() {
    rewriteCandidate.value = null;
  }

  async function applyTaskPatches() {
    if (!currentProject.value || !rewriteCandidate.value?.patches.length) return;
    if (!canLeaveCurrentChapter()) return;

    await novelApi.applyPatches(currentProject.value.slug, rewriteCandidate.value.patches);
    if (currentChapter.value) {
      await openChapter(currentChapter.value, currentDocumentKind.value);
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
    currentTask,
    taskProgress,
    taskHistory,
    rewriteCandidate,
    recapCandidate,
    currentQualityReport,
    styleTone,
    focusTargetWords,
    currentWordCount,
    focusProgressPercent,
    activeSceneCard,
    focusWritingGuide,
    currentDashboard,
    sceneCards,
    structureIdeaInput,
    structureDraftVersion,
    activeLedgerKind,
    ledgerEntries,
    writingMode,
    isSavingDashboard,
    isSavingScenes,
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
    currentProjectAssets,
    canLeaveCurrentWorkspace,
    loadProjects,
    loadPlatformLibrary,
    createProject,
    importProject,
    createSharedAsset,
    linkSharedAsset,
    loadChapterCockpit,
    updateDashboard,
    saveCurrentDashboard,
    updateSceneCards,
    saveCurrentSceneCards,
    saveCurrentStructure,
    updateStructureIdeaInput,
    reverseEngineerStructureFromDraft,
    generateStructureFromIdea,
    loadLedger,
    saveLedger,
    updateLedgerEntries,
    setWritingMode,
    updateFocusTargetWords,
    requestFocusDraft,
    requestFocusDraftRevision,
    diagnoseCurrentChapter,
    updateStyleTone,
    tuneSelectionStyle,
    requestWritingRecap,
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
    polishSelection,
    acceptRewrite,
    acceptFocusDraft,
    rejectRewrite,
    applyTaskPatches
  };
});
