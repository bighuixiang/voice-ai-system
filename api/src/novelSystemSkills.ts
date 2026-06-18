import type { ExpertRole, PromptPreset, SkillEntry } from "./types.js";

export interface NovelSkillContextBlock {
  title: string;
  content: string;
  tier: "T0" | "T1";
}

export const longNovelWriterRole: ExpertRole = {
  id: "role-long-novel-writer",
  name: "Long Novel Writer",
  domain: "novel",
  systemPrompt:
    "Turn outlines and chapter plans into publishable longform prose. Prioritize causality, honest POV, credible motivation, and chapter-level change before decorative prose.",
  defaultPromptIds: ["prompt-long-novel-writer"]
};

export const longNovelWriterPrompt: PromptPreset = {
  id: "prompt-long-novel-writer",
  title: "Longform Chapter Drafting",
  category: "novel",
  roleId: "role-long-novel-writer",
  prompt:
    "Define the irreversible chapter change and the price attached to it before drafting scenes. Every scene should contain a goal, pressure, action, reveal, and consequence.",
  tags: ["draft", "quality", "longform", "scene-design"],
  isSystem: true
};

export const longNovelWriterSkill: SkillEntry = {
  id: "skill-long-novel-writer",
  name: "long-novel-writer",
  scope: "system",
  description:
    "Quality-first longform drafting: design scene goals, escalate pressure, then pay off with consequence and a forward hook.",
  tags: ["novel", "quality", "draft", "longform"],
  enabled: true
};

const novelSkillDescriptionOverrides: Record<string, string> = {
  [longNovelWriterSkill.id]: longNovelWriterSkill.description,
  "skill-novel-continuity-check":
    "Check story bible, timeline, POV-known facts, foreshadowing payoff, and power progression for continuity risks."
};

const roleNameOverrides: Record<string, string> = {
  [longNovelWriterRole.id]: longNovelWriterRole.name
};

const promptTitleOverrides: Record<string, string> = {
  [longNovelWriterPrompt.id]: longNovelWriterPrompt.title
};

export function describeNovelSkill(skillId: string, fallback: string): string {
  return novelSkillDescriptionOverrides[skillId] || fallback;
}

export function displayNovelRoleName(roleId: string, fallback: string): string {
  return roleNameOverrides[roleId] || fallback;
}

export function displayNovelPromptTitle(promptId: string, fallback: string): string {
  return promptTitleOverrides[promptId] || fallback;
}

export function buildLongNovelWriterContextBlock(
  roleName = longNovelWriterRole.name,
  promptTitle = longNovelWriterPrompt.title
): NovelSkillContextBlock {
  return {
    title: "Long Novel Writer Skill",
    tier: "T0",
    content: [
      `activeRole: ${roleName}`,
      `activePrompt: ${promptTitle}`,
      "qualityPriority: causality > motivation > scene pressure > payoff > decorative prose",
      "chapterWorkflow:",
      "- Start from one irreversible chapter change instead of padding word count.",
      "- Every scene needs a goal, pressure, action, reveal, and visible price.",
      "- New lore or power must bind to cost, consequence, or relationship change on the page.",
      "- Keep POV honest; only state what the viewpoint can perceive, infer, or misunderstand.",
      "- End the chapter with a next-decision hook, not a decorative cliffhanger.",
      "rewriteGate:",
      "- Compress pretty but inert exposition, repeated emotion, and summary-only paragraphs.",
      "- If a paragraph does not change stakes, information, relationship, or rhythm, cut or merge it."
    ].join("\n")
  };
}

export function buildContinuityReviewSkillBlock(): NovelSkillContextBlock {
  return {
    title: "Continuity Review Skill",
    tier: "T1",
    content: [
      "checklist:",
      "- Character knowledge cannot exceed on-page experience.",
      "- Resolve timeline, foreshadowing, and power progression contradictions before polishing prose.",
      "- If a payoff lands, record what changed and what new risk or debt it creates."
    ].join("\n")
  };
}
