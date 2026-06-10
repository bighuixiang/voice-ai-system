import type { LedgerEntry, NovelChapter, NovelProject, StoryGraphEdge, StoryGraphNode, StoryGraphProjection } from "./types.js";
import { readLedgerEntries, readStoryControl } from "./writingCockpit.js";

const ledgerKinds: LedgerEntry["kind"][] = ["foreshadowing", "continuity", "power", "character", "risk"];

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
  for (const character of storyControl.characters || []) {
    const id = `character:${character.id}`;
    characterIdsByName.set(entityKey(character.name), id);
    addNode(nodes, {
      id,
      type: "character",
      label: character.name || character.id,
      subtitle: character.role || character.powerLevel,
      status: character.status,
      chapterIds: [character.firstChapterId, character.lastSeenChapterId].filter(Boolean) as string[]
    });
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

  return {
    projectSlug: project.slug,
    nodes: [...nodes.values()],
    edges: [...edges.values()],
    updatedAt: nowIso()
  };
}
