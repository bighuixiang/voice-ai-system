import crypto from "node:crypto";
import { listNarrativeObligations } from "./narrativeObligation.js";
import { readSceneCards } from "./writingCockpit.js";

export interface NarrativeObligationCandidate {
  schemaVersion: "narrative-obligation-candidate.v1";
  candidateId: string;
  markerId: string;
  status: "candidate";
  chapterIds: string[];
  sourceRefs: string[];
  existingObligationId: string | null;
}

function candidateId(markerId: string): string {
  const digest = crypto.createHash("sha256").update(markerId).digest("hex").slice(0, 16);
  return `obligation-candidate-${digest}`;
}

export async function buildNarrativeObligationCandidates(root: string, chapterIds: string[]): Promise<NarrativeObligationCandidate[]> {
  const references = new Map<string, Array<{ chapterId: string; order: number; sceneId: string }>>();
  for (const chapterId of [...new Set(chapterIds)].sort()) {
    const scenes = await readSceneCards(root, chapterId);
    for (const scene of scenes) {
      for (const markerId of scene.foreshadowingIds || []) {
        const items = references.get(markerId) || [];
        items.push({ chapterId, order: scene.order, sceneId: scene.id });
        references.set(markerId, items);
      }
    }
  }
  const obligations = await listNarrativeObligations(root);
  return [...references.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([markerId, items]) => {
    const ordered = items.sort((left, right) => left.chapterId.localeCompare(right.chapterId) || left.order - right.order || left.sceneId.localeCompare(right.sceneId));
    const existing = obligations.find((item) => item.sourceRefs.includes(markerId));
    return {
      schemaVersion: "narrative-obligation-candidate.v1",
      candidateId: candidateId(markerId),
      markerId,
      status: "candidate" as const,
      chapterIds: [...new Set(ordered.map((item) => item.chapterId))],
      sourceRefs: ordered.map((item) => `scene://${item.chapterId}#${item.sceneId}`),
      existingObligationId: existing?.obligationId || null
    };
  });
}
