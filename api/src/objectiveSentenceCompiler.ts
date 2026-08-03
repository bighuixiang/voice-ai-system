import type { CreativeObjectiveItem } from "./creativeObjective.js";

export function compileObjectiveSentence(input: { rawText: string; sourceRef: string; profileId: string }): CreativeObjectiveItem[] {
  if (!input.rawText.trim() || !input.sourceRef.trim() || !input.profileId.trim()) throw new Error("OBJECTIVE_SENTENCE_FIELDS_REQUIRED");
  const text = input.rawText.trim();
  const items: CreativeObjectiveItem[] = [];
  const add = (kind: CreativeObjectiveItem["kind"], value: string, id: string) => { if (value.trim()) items.push({ objectiveId: `${input.profileId}-${id}`, kind, text: value.trim(), scope: "work", sourceRefs: [input.sourceRef], verification: "review against candidate" }); };
  const protagonist = text.match(/想写一个(.+?)(?:，|,|；|;|$)/)?.[1];
  if (protagonist) add("aspiration", `人物体验：${protagonist}`, "vision-protagonist");
  const fair = text.match(/悬疑要(.+?)(?:，|,|；|;|$)/)?.[1];
  if (fair) add("hard_constraint", `悬疑约束：${fair}`, "hard-mystery");
  const ending = text.match(/结尾(.+?)(?:。|\.|$)/)?.[1];
  if (ending) add("anti_goal", `结尾反目标：${ending}`, "anti-ending");
  if (items.length < 2) throw new Error("OBJECTIVE_SENTENCE_UNDER_SPECIFIED");
  return items;
}
