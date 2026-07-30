import crypto from "node:crypto";

export interface WorkspaceContinuityToken {
  schemaVersion: "workspace-continuity-token.v1";
  tokenId: string;
  projectSlug: string;
  sessionCursor: number;
  primaryAsset: string;
  assetVersion: string;
  selection: { chapterId?: string; rangeStart?: number; rangeEnd?: number };
  focusTarget: string;
  scrollAnchor: string;
  unsavedDraftFingerprint: string;
  pendingRefs: string[];
  localCacheVersion: string;
  serviceBaselineFingerprint: string;
  expiresAt: string;
  status: "current" | "expired";
  fingerprint: string;
}
export interface ContinuityReconciliation {
  status: "current" | "conflicted" | "expired";
  localPreserved: boolean;
  serverAdvanced: boolean;
  action: "continue" | "compare-or-save-candidate" | "refresh-token";
  reasons: string[];
}
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function createWorkspaceContinuityToken(input: Omit<WorkspaceContinuityToken, "schemaVersion" | "tokenId" | "status" | "fingerprint">): WorkspaceContinuityToken {
  if (!input.projectSlug.trim() || input.sessionCursor < 0 || !input.primaryAsset.trim() || !input.assetVersion.trim() || !input.focusTarget.trim() || !input.localCacheVersion.trim() || !input.serviceBaselineFingerprint.trim() || !input.expiresAt.trim()) throw new Error("CONTINUITY_TOKEN_FIELDS_REQUIRED");
  const base = { schemaVersion: "workspace-continuity-token.v1" as const, tokenId: `continuity-${crypto.randomUUID()}`, ...input, pendingRefs: [...input.pendingRefs], status: new Date(input.expiresAt).getTime() <= Date.now() ? "expired" as const : "current" as const };
  return { ...base, fingerprint: hash(base) };
}

export function reconcileWorkspaceContinuity(token: WorkspaceContinuityToken, current: { serviceBaselineFingerprint: string; assetVersion: string; cursor: number }): ContinuityReconciliation {
  if (token.status === "expired" || new Date(token.expiresAt).getTime() <= Date.now()) return { status: "expired", localPreserved: true, serverAdvanced: false, action: "refresh-token", reasons: ["token-expired"] };
  const serverAdvanced = current.serviceBaselineFingerprint !== token.serviceBaselineFingerprint || current.cursor > token.sessionCursor;
  const localChanged = current.assetVersion !== token.assetVersion;
  if (serverAdvanced || localChanged) return { status: "conflicted", localPreserved: true, serverAdvanced, action: "compare-or-save-candidate", reasons: [...(serverAdvanced ? ["service-advanced"] : []), ...(localChanged ? ["asset-version-mismatch"] : [])] };
  return { status: "current", localPreserved: true, serverAdvanced: false, action: "continue", reasons: [] };
}
