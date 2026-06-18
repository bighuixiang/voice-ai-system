import type { ChapterDashboard, SceneCard } from "@/types/novel";

export interface ReverseStructurePayload {
  dashboard?: Partial<ChapterDashboard>;
  scenes?: Array<Partial<SceneCard>>;
  sceneCards?: Array<Partial<SceneCard>>;
}

interface BuildDashboardSeedInput {
  chapterId: string;
  currentContent: string;
  currentDashboard: ChapterDashboard | null;
  patch: Partial<ChapterDashboard>;
}

export function countDraftWords(content: string): number {
  return content.replace(/\s+/g, "").length;
}

export function compactSnippet(value: string, maxLength = 36): string {
  const compacted = value.replace(/\s+/g, " ").trim();
  if (compacted.length <= maxLength) return compacted;
  return `${compacted.slice(0, maxLength)}...`;
}

export function splitTextUnits(content: string): string[] {
  return content
    .replace(/\r/g, "\n")
    .split(/[\n。！？?!]+/)
    .map((unit) => unit.replace(/\s+/g, " ").trim())
    .filter((unit) => unit.length >= 4);
}

export function pickConflict(units: string[]): string {
  return (
    units.find((unit) => /冲突|危险|代价|必须|不能|选择|暴露|失去/.test(unit)) || units[Math.min(1, units.length - 1)] || ""
  );
}

export function inferPov(content: string): string {
  if (/我|我的|我们/.test(content)) return "第一人称视角";
  if (/他|她|少年|少女|主角|主人公/.test(content)) return "主角限知视角";
  return "待确认视角";
}

export function inferLocation(unit: string): string {
  const matched = unit.match(/(?:在|来到|走进|进入)([^，。！？?!\s]{2,10})/);
  return matched?.[1] || "";
}

export function inferPowerProgression(unit: string): string {
  return /血|力量|灵气|法|印|修为|能力|升级|突破/.test(unit) ? compactSnippet(unit, 30) : "";
}

export function makeSceneCard(chapterId: string, order: number, seed: Partial<SceneCard>): SceneCard {
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

export function buildDashboardSeed(input: BuildDashboardSeedInput): ChapterDashboard {
  const now = new Date().toISOString();
  return {
    goal: "",
    pov: "",
    mainConflict: "",
    endingHook: "",
    wordCount: countDraftWords(input.currentContent),
    status: "empty",
    unresolvedForeshadowingIds: [],
    continuityRiskIds: [],
    ...input.currentDashboard,
    ...input.patch,
    chapterId: input.chapterId,
    updatedAt: now
  };
}

export function buildSceneCardsFromDraft(content: string, chapterId: string): SceneCard[] {
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

export function buildSceneCardsFromIdea(idea: string, chapterId: string): SceneCard[] {
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

function extractJsonText(value: string): string {
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

function textField(source: Record<string, unknown>, key: string, maxLength = 800): string {
  const value = source[key];
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function arrayField(source: Record<string, unknown>, key: string): string[] {
  const value = source[key];
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 12);
}

function statusField(value: unknown, fallback: ChapterDashboard["status"]): ChapterDashboard["status"] {
  const allowed: ChapterDashboard["status"][] = ["empty", "planned", "drafting", "drafted", "reviewing", "checked"];
  return allowed.includes(value as ChapterDashboard["status"]) ? (value as ChapterDashboard["status"]) : fallback;
}

export function parseReverseStructureResult(content: unknown, chapterId: string, currentContent: string) {
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
      status: statusField(dashboardSource.status, countDraftWords(currentContent) > 80 ? "drafted" : "drafting")
    },
    cards
  };
}
