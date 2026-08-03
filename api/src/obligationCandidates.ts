import crypto from "node:crypto";
import { listNarrativeObligations } from "./narrativeObligation.js";
import { readChapterDashboard, readLedgerEntries, readSceneCards, readStoryControl } from "./writingCockpit.js";

export interface NarrativeObligationCandidate {
  schemaVersion: "narrative-obligation-candidate.v1";
  candidateId: string;
  markerId: string;
  status: "candidate";
  chapterIds: string[];
  sourceRefs: string[];
  existingObligationId: string | null;
  fingerprint: string;
}

function candidateId(markerId: string): string {
  const digest = crypto.createHash("sha256").update(markerId).digest("hex").slice(0, 16);
  return `obligation-candidate-${digest}`;
}

export async function buildNarrativeObligationCandidates(root: string, chapterIds: string[]): Promise<NarrativeObligationCandidate[]> {
  const references = new Map<string, Array<{ chapterId: string; order: number; sceneId: string; sourceRef?: string }>>();
  const addMarker = (markerId: string, reference: { chapterId: string; order: number; sceneId: string; sourceRef?: string }) => {
    const normalized = markerId.trim();
    if (!normalized) return;
    const items = references.get(normalized) || [];
    items.push(reference);
    references.set(normalized, items);
  };
  const markerTokens = (value: string): string[] => value.match(/\b(?:FS|OBL|FORESHADOW)[-_][A-Z0-9_-]+\b/gi) || [];
  for (const chapterId of [...new Set(chapterIds)].sort()) {
    const scenes = await readSceneCards(root, chapterId);
    for (const scene of scenes) {
      for (const markerId of scene.foreshadowingIds || []) {
        addMarker(markerId, { chapterId, order: scene.order, sceneId: scene.id });
      }
      for (const beat of scene.craftBeats || []) {
        if (beat.type !== "foreshadow_setup" && beat.type !== "foreshadow_payoff") continue;
        for (const markerId of markerTokens([beat.label, beat.setup || "", beat.payoff || ""].join(" "))) {
          addMarker(markerId, { chapterId, order: scene.order, sceneId: beat.id, sourceRef: `craft://${chapterId}#${beat.id}` });
        }
      }
    }
    const dashboard = await readChapterDashboard(root, chapterId);
    for (const markerId of dashboard.unresolvedForeshadowingIds || []) {
      addMarker(markerId, { chapterId, order: Number.MAX_SAFE_INTEGER, sceneId: `dashboard-${chapterId}`, sourceRef: `dashboard://${chapterId}` });
    }
  }
  for (const entry of await readLedgerEntries(root, "foreshadowing")) {
    const markerId = typeof entry.id === "string" ? entry.id.trim() : "";
    if (!markerId) continue;
    addMarker(markerId, { chapterId: "~", order: Number.MAX_SAFE_INTEGER, sceneId: `ledger-foreshadowing-${markerId}`, sourceRef: `ledger://foreshadowing#${markerId}` });
  }
  const storyControl = await readStoryControl(root);
  for (const event of storyControl.events || []) {
    for (const markerId of markerTokens(event.foreshadowing || "")) {
      addMarker(markerId, { chapterId: "~", order: Number.MAX_SAFE_INTEGER, sceneId: `story-event-${event.id}`, sourceRef: `story-event://${event.id}` });
    }
    for (const beat of event.craftBeats || []) {
      if (beat.type !== "foreshadow_setup" && beat.type !== "foreshadow_payoff") continue;
      for (const markerId of markerTokens([beat.label, beat.setup || "", beat.payoff || ""].join(" "))) {
        addMarker(markerId, { chapterId: "~", order: Number.MAX_SAFE_INTEGER, sceneId: `story-event-craft-${event.id}-${beat.id}`, sourceRef: `craft://story-event/${event.id}#${beat.id}` });
      }
    }
  }
  const obligations = await listNarrativeObligations(root);
  return [...references.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([markerId, items]) => {
    const sourcePriority = (item: { sourceRef?: string }) => item.sourceRef?.startsWith("craft://") ? 0 : item.sourceRef?.startsWith("story-event://") ? 1 : 2;
    const ordered = items.sort((left, right) => sourcePriority(left) - sourcePriority(right) || left.chapterId.localeCompare(right.chapterId) || left.order - right.order || left.sceneId.localeCompare(right.sceneId));
    const existing = obligations.find((item) => item.sourceRefs.includes(markerId));
    const base = {
      schemaVersion: "narrative-obligation-candidate.v1" as const,
      candidateId: candidateId(markerId),
      markerId,
      status: "candidate" as const,
      chapterIds: [...new Set(ordered.map((item) => item.chapterId).filter(Boolean))],
      sourceRefs: [...new Set(ordered.map((item) => item.sourceRef || `scene://${item.chapterId}#${item.sceneId}`))],
      existingObligationId: existing?.obligationId || null
    };
    return { ...base, fingerprint: crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex") };
  });
}
