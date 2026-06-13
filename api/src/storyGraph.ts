import fs from "node:fs/promises";
import path from "node:path";
import type {
  CharacterAppearanceSignal,
  CharacterRelationGraph,
  CharacterRelationshipCoverage,
  CharacterRelationshipEdge,
  CharacterRelationshipEvidence,
  CharacterScheduleStatus,
  CharacterRelationshipSourceType,
  KnowledgeTriple,
  LedgerEntry,
  NovelChapter,
  NovelProject,
  StoryCharacterProfile,
  StoryEventCard,
  StoryGraphEdge,
  StoryGraphNode,
  StoryGraphProjection
} from "./types.js";
import { readLedgerEntries, readStoryControl } from "./writingCockpit.js";
import { resolveInside } from "./pathSafety.js";
import { readKnowledgeIndex } from "./knowledgeIndex.js";

const ledgerKinds: LedgerEntry["kind"][] = ["foreshadowing", "continuity", "power", "character", "risk"];
const relationshipPredicates = new Set([
  "ally",
  "enemy",
  "friend",
  "mentor",
  "student",
  "teacher",
  "rival",
  "partner",
  "parent",
  "child",
  "sibling",
  "lover",
  "spouse",
  "trusts",
  "betrays",
  "protects",
  "serves",
  "leads",
  "knows",
  "师徒",
  "师父",
  "徒弟",
  "父子",
  "母子",
  "父女",
  "母女",
  "兄弟",
  "姐妹",
  "夫妻",
  "朋友",
  "盟友",
  "敌对",
  "仇敌",
  "对手",
  "竞争",
  "上下级",
  "主仆",
  "雇佣",
  "认识",
  "相识",
  "信任",
  "背叛",
  "保护",
  "追随",
  "领导"
]);

function nowIso(): string {
  return new Date().toISOString();
}

function chapterNumber(chapter: NovelChapter): number {
  const fromId = chapter.id.match(/(\d+)/)?.[1];
  return Number.parseInt(fromId || "", 10) || chapter.order || 0;
}

function chapterIdsFromText(text: string, chapters: NovelChapter[]): string[] {
  const numbers = [...text.matchAll(/\d{1,4}/g)].map((match) => Number.parseInt(match[0], 10)).filter(Number.isFinite);
  if (!numbers.length) return [];
  const sorted = [...chapters].sort((left, right) => chapterNumber(left) - chapterNumber(right));
  const [first, second] = numbers;
  if (second !== undefined && second >= first) {
    return sorted.filter((chapter) => {
      const value = chapterNumber(chapter);
      return value >= first && value <= second;
    }).map((chapter) => chapter.id);
  }
  const padded = String(first).padStart(3, "0");
  return sorted.filter((chapter) => chapter.id.endsWith(padded) || chapterNumber(chapter) === first).map((chapter) => chapter.id);
}

function addNode(nodes: Map<string, StoryGraphNode>, node: StoryGraphNode): void {
  if (!node.label.trim()) return;
  nodes.set(node.id, node);
}

function addEdge(edges: Map<string, StoryGraphEdge>, edge: StoryGraphEdge): void {
  if (edge.source === edge.target) return;
  edges.set(edge.id, edge);
}

function entityKey(input: string): string {
  return input.trim().toLowerCase();
}

function knowledgeNodeId(input: string): string {
  const key = input
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90);
  return `knowledge:${key || "entity"}`;
}

function mergeChapterIds(left: string[] = [], right: string[] = []): string[] {
  return [...new Set([...left, ...right].filter(Boolean))];
}

function relationshipKey(sourceId: string, targetId: string, label: string): string {
  return `${sourceId}->${targetId}:${label.trim().toLowerCase() || "relationship"}`;
}

function relationshipId(sourceId: string, targetId: string, label: string): string {
  return `character-rel:${sourceId.replace(/^character:/, "")}->${targetId.replace(/^character:/, "")}:${knowledgeNodeId(label).replace(/^knowledge:/, "")}`;
}

function isRelationshipPredicate(predicate: string): boolean {
  const normalized = predicate.trim().toLowerCase();
  if (!normalized) return false;
  if (relationshipPredicates.has(normalized)) return true;
  return [...relationshipPredicates].some((token) => normalized.includes(token.toLowerCase()));
}

function characterIdForName(characterIdsByName: Map<string, string>, name: string): string | undefined {
  return characterIdsByName.get(entityKey(name));
}

function addCharacterRelationship(
  relationships: Map<string, CharacterRelationshipEdge>,
  sourceId: string,
  targetId: string,
  sourceName: string,
  targetName: string,
  label: string,
  evidence: CharacterRelationshipEvidence
): void {
  if (sourceId === targetId) return;
  const normalizedLabel = label.trim() || "relationship";
  const key = relationshipKey(sourceId, targetId, normalizedLabel);
  const existing = relationships.get(key);
  if (existing) {
    existing.weight += 1;
    existing.chapterIds = mergeChapterIds(existing.chapterIds, evidence.chapterIds);
    existing.sourceTypes = [...new Set([...existing.sourceTypes, evidence.sourceType])];
    existing.evidence.push(evidence);
    return;
  }

  relationships.set(key, {
    id: relationshipId(sourceId, targetId, normalizedLabel),
    sourceCharacterId: sourceId,
    targetCharacterId: targetId,
    sourceName,
    targetName,
    label: normalizedLabel,
    weight: 1,
    sourceTypes: [evidence.sourceType],
    chapterIds: evidence.chapterIds,
    evidence: [evidence]
  });
}

function addKnowledgeRelationships(
  relationships: Map<string, CharacterRelationshipEdge>,
  triples: KnowledgeTriple[],
  characterIdsByName: Map<string, string>,
  characterNamesById: Map<string, string>
): void {
  for (const triple of triples) {
    const sourceId = characterIdForName(characterIdsByName, triple.subject);
    const targetId = characterIdForName(characterIdsByName, triple.object);
    if (!sourceId || !targetId) continue;
    if (!isRelationshipPredicate(triple.predicate) && sourceId !== targetId) {
      const endpointsAreCharacters = characterNamesById.has(sourceId) && characterNamesById.has(targetId);
      if (!endpointsAreCharacters) continue;
    }
    addCharacterRelationship(
      relationships,
      sourceId,
      targetId,
      characterNamesById.get(sourceId) || triple.subject,
      characterNamesById.get(targetId) || triple.object,
      triple.predicate || "knowledge",
      {
        sourceType: "knowledge",
        sourceId: triple.id,
        label: triple.predicate || "knowledge",
        chapterIds: triple.chapterIds || [],
        note: `${triple.subject} ${triple.predicate} ${triple.object}`.trim()
      }
    );
  }
}

function addEventRelationships(
  relationships: Map<string, CharacterRelationshipEdge>,
  events: StoryEventCard[],
  characterIdsByName: Map<string, string>,
  characterNamesById: Map<string, string>,
  chapters: NovelChapter[]
): void {
  for (const event of events) {
    const participantIds = (event.participants || [])
      .map((participant) => characterIdForName(characterIdsByName, participant))
      .filter((id): id is string => Boolean(id));
    const uniqueIds = [...new Set(participantIds)];
    if (uniqueIds.length < 2) continue;
    const chapterIds = chapterIdsFromText(event.chapterRange, chapters);
    for (let leftIndex = 0; leftIndex < uniqueIds.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < uniqueIds.length; rightIndex += 1) {
        const sourceId = uniqueIds[leftIndex];
        const targetId = uniqueIds[rightIndex];
        addCharacterRelationship(
          relationships,
          sourceId,
          targetId,
          characterNamesById.get(sourceId) || sourceId,
          characterNamesById.get(targetId) || targetId,
          "co-appears",
          {
            sourceType: "event",
            sourceId: event.id,
            label: event.title || event.type || "event",
            chapterIds,
            note: event.conflict || event.trigger || event.location
          }
        );
      }
    }
  }
}

function addProfileRelationships(
  relationships: Map<string, CharacterRelationshipEdge>,
  characters: StoryCharacterProfile[],
  characterIdsByName: Map<string, string>,
  characterNamesById: Map<string, string>
): void {
  for (const character of characters) {
    const sourceId = characterIdForName(characterIdsByName, character.name);
    const notes = character.relationshipNotes?.trim();
    if (!sourceId || !notes) continue;
    for (const other of characters) {
      if (other.id === character.id || !other.name.trim()) continue;
      if (!notes.includes(other.name)) continue;
      const targetId = characterIdForName(characterIdsByName, other.name);
      if (!targetId) continue;
      addCharacterRelationship(
        relationships,
        sourceId,
        targetId,
        characterNamesById.get(sourceId) || character.name,
        characterNamesById.get(targetId) || other.name,
        "profile-note",
        {
          sourceType: "profile",
          sourceId: character.id,
          label: "profile-note",
          chapterIds: [character.firstChapterId, character.lastSeenChapterId].filter(Boolean) as string[],
          note: notes.slice(0, 240)
        }
      );
    }
  }
}

function characterRolePriority(character: StoryCharacterProfile): number {
  const role = `${character.role} ${character.status}`.toLowerCase();
  if (/(protagonist|main|lead|pov|hero|主角|主线|核心|视角)/i.test(role)) return 0;
  if (/(major|support|mentor|guide|ally|配角|重要|导师|伙伴|盟友)/i.test(role)) return 1;
  if (/(minor|cameo|background|次要|背景|路人)/i.test(role)) return 3;
  return 2;
}

function chapterNumberById(chapters: NovelChapter[]): Map<string, number> {
  return new Map(chapters.map((chapter) => [chapter.id, chapterNumber(chapter)]));
}

function minChapterNumber(chapterIds: string[], chapterNumbers: Map<string, number>): number {
  const numbers = chapterIds.map((id) => chapterNumbers.get(id) || 0).filter((value) => value > 0);
  return numbers.length ? Math.min(...numbers) : 0;
}

function maxChapterNumber(chapterIds: string[], chapterNumbers: Map<string, number>): number {
  const numbers = chapterIds.map((id) => chapterNumbers.get(id) || 0).filter((value) => value > 0);
  return numbers.length ? Math.max(...numbers) : 0;
}

function addAppearanceChapterIds(
  target: Map<string, Set<string>>,
  characterId: string,
  chapterIds: string[]
): void {
  if (!chapterIds.length) return;
  const current = target.get(characterId) || new Set<string>();
  for (const chapterId of chapterIds) {
    if (chapterId) current.add(chapterId);
  }
  target.set(characterId, current);
}

function buildCharacterAppearanceSignals(
  storyCharacters: StoryCharacterProfile[],
  events: StoryEventCard[],
  knowledgeTriples: KnowledgeTriple[],
  relationships: CharacterRelationshipEdge[],
  coverage: CharacterRelationshipCoverage[],
  characterIdsByName: Map<string, string>,
  chapters: NovelChapter[]
): CharacterAppearanceSignal[] {
  const chapterNumbers = chapterNumberById(chapters);
  const currentChapterNumber = chapters.reduce((max, chapter) => Math.max(max, chapterNumber(chapter)), 0);
  const appearanceChapterIds = new Map<string, Set<string>>();
  const fallbackAppearanceCounts = new Map<string, number>();

  for (const event of events) {
    const chapterIds = chapterIdsFromText(event.chapterRange, chapters);
    for (const participant of event.participants || []) {
      const characterId = characterIdForName(characterIdsByName, participant);
      if (!characterId) continue;
      if (chapterIds.length) {
        addAppearanceChapterIds(appearanceChapterIds, characterId, chapterIds);
      } else {
        fallbackAppearanceCounts.set(characterId, (fallbackAppearanceCounts.get(characterId) || 0) + 1);
      }
    }
  }

  for (const triple of knowledgeTriples) {
    const subjectId = characterIdForName(characterIdsByName, triple.subject);
    const objectId = characterIdForName(characterIdsByName, triple.object);
    if (subjectId) addAppearanceChapterIds(appearanceChapterIds, subjectId, triple.chapterIds || []);
    if (objectId) addAppearanceChapterIds(appearanceChapterIds, objectId, triple.chapterIds || []);
  }

  for (const relationship of relationships) {
    addAppearanceChapterIds(appearanceChapterIds, relationship.sourceCharacterId, relationship.chapterIds || []);
    addAppearanceChapterIds(appearanceChapterIds, relationship.targetCharacterId, relationship.chapterIds || []);
  }

  const activeUpcomingText = events
    .filter((event) => event.status === "planned" || event.status === "active")
    .filter((event) => {
      const first = minChapterNumber(chapterIdsFromText(event.chapterRange, chapters), chapterNumbers);
      return first === 0 || first >= currentChapterNumber;
    })
    .map((event) => [event.title, event.trigger, event.conflict, event.foreshadowing, ...(event.participants || [])].join(" "))
    .join("\n")
    .toLowerCase();

  return storyCharacters
    .map((character) => {
      const characterId = `character:${character.id}`;
      const chapterIds = new Set(appearanceChapterIds.get(characterId) || []);
      for (const chapterId of [character.firstChapterId, character.lastSeenChapterId].filter(Boolean) as string[]) {
        chapterIds.add(chapterId);
      }

      const lastChapterNumber = maxChapterNumber([...chapterIds], chapterNumbers);
      const lastChapterId = [...chapterIds].find((id) => (chapterNumbers.get(id) || 0) === lastChapterNumber);
      const appearanceCount = chapterIds.size + (fallbackAppearanceCounts.get(characterId) || 0);
      const gapChapters = lastChapterNumber > 0 && currentChapterNumber > 0 ? Math.max(0, currentChapterNumber - lastChapterNumber) : undefined;
      const coverageItem = coverage.find((item) => item.characterId === characterId);
      const relationshipCount = coverageItem?.relationshipCount || 0;
      const priority = characterRolePriority(character);
      const mentionedInUpcoming = Boolean(character.name.trim() && activeUpcomingText.includes(character.name.trim().toLowerCase()));
      const reasons: string[] = [];
      let status: CharacterScheduleStatus = "balanced";

      if (priority <= 1) reasons.push("主线角色优先");
      if (mentionedInUpcoming) reasons.push("下一段事件已提及");
      if (appearanceCount === 0) reasons.push("尚无正文登场证据");
      if (relationshipCount === 0) reasons.push("关系图缺少证据");
      if (gapChapters !== undefined && gapChapters >= 5) reasons.push("长期未登场");
      if (appearanceCount >= 4 && (gapChapters === undefined || gapChapters <= 1)) reasons.push("近期连续出现");

      if ((appearanceCount === 0 || (gapChapters !== undefined && gapChapters >= 5)) && priority <= 1) {
        status = "should-appear";
      } else if (appearanceCount >= 4 && (gapChapters === undefined || gapChapters <= 1)) {
        status = "overexposed";
      } else if (relationshipCount === 0 && appearanceCount === 0) {
        status = "absent";
      }

      return {
        characterId,
        name: character.name,
        status,
        priority,
        appearanceCount,
        lastChapterId,
        lastChapterNumber: lastChapterNumber || undefined,
        gapChapters,
        mentionedInUpcoming,
        relationshipCount,
        reasons: reasons.length ? reasons : ["节奏正常"]
      };
    })
    .sort((left, right) => {
      const statusOrder: Record<CharacterScheduleStatus, number> = {
        "should-appear": 0,
        absent: 1,
        overexposed: 2,
        balanced: 3
      };
      return statusOrder[left.status] - statusOrder[right.status] || left.priority - right.priority || left.name.localeCompare(right.name);
    });
}

function buildCharacterRelationGraph(
  storyCharacters: StoryCharacterProfile[],
  events: StoryEventCard[],
  knowledgeTriples: KnowledgeTriple[],
  characterIdsByName: Map<string, string>,
  characterNamesById: Map<string, string>,
  characterNodes: StoryGraphNode[],
  chapters: NovelChapter[]
): CharacterRelationGraph {
  const relationships = new Map<string, CharacterRelationshipEdge>();
  addKnowledgeRelationships(relationships, knowledgeTriples, characterIdsByName, characterNamesById);
  addEventRelationships(relationships, events, characterIdsByName, characterNamesById, chapters);
  addProfileRelationships(relationships, storyCharacters, characterIdsByName, characterNamesById);

  const relationshipList = [...relationships.values()].sort((left, right) => right.weight - left.weight || left.label.localeCompare(right.label));
  const coverage: CharacterRelationshipCoverage[] = characterNodes.map((node) => {
    const related = relationshipList.filter((item) => item.sourceCharacterId === node.id || item.targetCharacterId === node.id);
    const evidence = related.flatMap((item) => item.evidence);
    const profile = storyCharacters.find((character) => `character:${character.id}` === node.id);
    return {
      characterId: node.id,
      name: node.label,
      relationshipCount: related.length,
      eventCount: evidence.filter((item) => item.sourceType === "event").length,
      knowledgeTripleCount: evidence.filter((item) => item.sourceType === "knowledge").length,
      hasProfileNote: Boolean(profile?.relationshipNotes?.trim()),
      isolated: related.length === 0
    };
  });
  const appearanceSignals = buildCharacterAppearanceSignals(
    storyCharacters,
    events,
    knowledgeTriples,
    relationshipList,
    coverage,
    characterIdsByName,
    chapters
  );

  return {
    characters: characterNodes,
    relationships: relationshipList,
    coverage,
    appearanceSignals
  };
}

export async function buildStoryGraphProjection(root: string, project: NovelProject): Promise<StoryGraphProjection> {
  const storyControl = await readStoryControl(root);
  const nodes = new Map<string, StoryGraphNode>();
  const edges = new Map<string, StoryGraphEdge>();

  for (const chapter of project.chapters) {
    addNode(nodes, {
      id: `chapter:${chapter.id}`,
      type: "chapter",
      label: chapter.title || chapter.id,
      subtitle: chapter.id,
      status: chapter.status,
      chapterIds: [chapter.id]
    });
  }

  const characterIdsByName = new Map<string, string>();
  const characterNamesById = new Map<string, string>();
  const characterNodes: StoryGraphNode[] = [];
  for (const character of storyControl.characters || []) {
    const id = `character:${character.id}`;
    characterIdsByName.set(entityKey(character.name), id);
    characterNamesById.set(id, character.name || character.id);
    const node = {
      id,
      type: "character",
      label: character.name || character.id,
      subtitle: character.role || character.powerLevel,
      status: character.status,
      chapterIds: [character.firstChapterId, character.lastSeenChapterId].filter(Boolean) as string[]
    } satisfies StoryGraphNode;
    characterNodes.push(node);
    addNode(nodes, node);
  }

  const arcChapterIds = new Map<string, string[]>();
  for (const arc of storyControl.arcs || []) {
    const id = `arc:${arc.id}`;
    const chapterIds = chapterIdsFromText(arc.chapterRange, project.chapters);
    arcChapterIds.set(id, chapterIds);
    addNode(nodes, {
      id,
      type: "arc",
      label: arc.title || arc.id,
      subtitle: arc.chapterRange,
      status: arc.status,
      chapterIds
    });
    for (const chapterId of chapterIds) {
      addEdge(edges, {
        id: `${id}->chapter:${chapterId}`,
        source: id,
        target: `chapter:${chapterId}`,
        type: "contains",
        label: "contains"
      });
    }
  }

  for (const event of storyControl.events || []) {
    const id = `event:${event.id}`;
    const chapterIds = chapterIdsFromText(event.chapterRange, project.chapters);
    addNode(nodes, {
      id,
      type: "event",
      label: event.title || event.id,
      subtitle: event.location || event.chapterRange || event.type,
      status: event.status,
      chapterIds
    });
    for (const chapterId of chapterIds) {
      addEdge(edges, {
        id: `${id}->chapter:${chapterId}`,
        source: id,
        target: `chapter:${chapterId}`,
        type: "contains",
        label: "occurs"
      });
    }
    for (const participant of event.participants || []) {
      const characterId = characterIdsByName.get(entityKey(participant));
      if (!characterId) continue;
      addEdge(edges, {
        id: `${id}->${characterId}`,
        source: id,
        target: characterId,
        type: "involves",
        label: "involves"
      });
    }
    for (const [arcId, arcChapters] of arcChapterIds.entries()) {
      if (chapterIds.some((chapterId) => arcChapters.includes(chapterId))) {
        addEdge(edges, {
          id: `${arcId}->${id}`,
          source: arcId,
          target: id,
          type: "contains",
          label: "contains"
        });
      }
    }
  }

  const ledgers = (await Promise.all(ledgerKinds.map((kind) => readLedgerEntries(root, kind)))).flat();
  for (const entry of ledgers) {
    const id = `ledger:${entry.id}`;
    addNode(nodes, {
      id,
      type: "ledger",
      label: entry.title || entry.id,
      subtitle: entry.kind,
      status: entry.status,
      chapterIds: entry.chapterIds || []
    });
    for (const chapterId of entry.chapterIds || []) {
      addEdge(edges, {
        id: `${id}->chapter:${chapterId}`,
        source: id,
        target: `chapter:${chapterId}`,
        type: "tracks",
        label: entry.kind
      });
    }
    for (const entity of entry.relatedEntities || []) {
      const characterId = characterIdsByName.get(entityKey(entity));
      if (!characterId) continue;
      addEdge(edges, {
        id: `${id}->${characterId}`,
        source: id,
        target: characterId,
        type: "references",
        label: entry.kind
      });
    }
  }

  const knowledge = await readKnowledgeIndex(root, project);
  for (const triple of knowledge.triples) {
    const subject = triple.subject.trim();
    const object = triple.object.trim();
    if (!subject || !object) continue;
    const subjectId = knowledgeNodeId(subject);
    const objectId = knowledgeNodeId(object);
    const subjectExisting = nodes.get(subjectId);
    const objectExisting = nodes.get(objectId);
    addNode(nodes, {
      id: subjectId,
      type: "knowledge",
      label: subject,
      subtitle: "subject",
      status: "indexed",
      chapterIds: mergeChapterIds(subjectExisting?.chapterIds, triple.chapterIds)
    });
    addNode(nodes, {
      id: objectId,
      type: "knowledge",
      label: object,
      subtitle: "object",
      status: "indexed",
      chapterIds: mergeChapterIds(objectExisting?.chapterIds, triple.chapterIds)
    });
    addEdge(edges, {
      id: `triple:${triple.id}`,
      source: subjectId,
      target: objectId,
      type: "asserts",
      label: triple.predicate || "asserts"
    });
    for (const chapterId of triple.chapterIds || []) {
      addEdge(edges, {
        id: `triple:${triple.id}->chapter:${chapterId}`,
        source: subjectId,
        target: `chapter:${chapterId}`,
        type: "references",
        label: "knowledge"
      });
      addEdge(edges, {
        id: `chapter:${chapterId}->${objectId}`,
        source: `chapter:${chapterId}`,
        target: objectId,
        type: "references",
        label: "knowledge"
      });
    }
  }

  const characterRelations = buildCharacterRelationGraph(
    storyControl.characters || [],
    storyControl.events || [],
    knowledge.triples,
    characterIdsByName,
    characterNamesById,
    characterNodes,
    project.chapters
  );
  for (const relationship of characterRelations.relationships) {
    addEdge(edges, {
      id: relationship.id,
      source: relationship.sourceCharacterId,
      target: relationship.targetCharacterId,
      type: "relationship",
      label: relationship.label
    });
  }

  const projection = {
    projectSlug: project.slug,
    nodes: [...nodes.values()],
    edges: [...edges.values()],
    characterRelations,
    updatedAt: nowIso()
  };
  const target = resolveInside(root, "story-graph/storyline.json");
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${JSON.stringify(projection, null, 2)}\n`, "utf8");
  return projection;
}
