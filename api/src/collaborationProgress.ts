import crypto from "node:crypto";

export interface CollaborationProgress {
  schemaVersion: "collaboration-progress.v1";
  understood: string[];
  progressing: string[];
  changedAssets: string[];
  risks: string[];
  nextAutoAction: string;
  authorDecisionNeeded: string[];
  fingerprint: string;
}

const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function createCollaborationProgress(input: Omit<CollaborationProgress, "schemaVersion" | "fingerprint">): CollaborationProgress {
  if (!input.nextAutoAction.trim()) throw new Error("COLLAB_PROGRESS_NEXT_ACTION_REQUIRED");
  const base = { schemaVersion: "collaboration-progress.v1" as const, understood: [...input.understood], progressing: [...input.progressing], changedAssets: [...input.changedAssets], risks: [...input.risks], nextAutoAction: input.nextAutoAction, authorDecisionNeeded: [...input.authorDecisionNeeded] };
  return { ...base, fingerprint: hash(base) };
}
