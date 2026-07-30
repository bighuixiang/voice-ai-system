import { describe, expect, it } from "vitest";
import { createWorkspaceContinuityToken, reconcileWorkspaceContinuity } from "./workspaceContinuity.js";

const base = { projectSlug: "p1", sessionCursor: 4, primaryAsset: "understanding-preview", assetVersion: "asset-v2", selection: { chapterId: "ch-1", rangeStart: 10, rangeEnd: 20 }, focusTarget: "editor", scrollAnchor: "scene-2", unsavedDraftFingerprint: "draft-fp", pendingRefs: ["question-1", "task-1"], localCacheVersion: "cache-v3", serviceBaselineFingerprint: "server-fp", expiresAt: "2099-01-01T00:00:00.000Z" };

describe("workspace continuity token", () => {
  it("captures navigation state without becoming canon", () => {
    const token = createWorkspaceContinuityToken(base);
    expect(token).toMatchObject({ schemaVersion: "workspace-continuity-token.v1", projectSlug: "p1", primaryAsset: "understanding-preview", status: "current" });
    expect(token).not.toHaveProperty("manuscript");
  });

  it("reconciles a server advance instead of overwriting local state", () => {
    const token = createWorkspaceContinuityToken(base);
    const result = reconcileWorkspaceContinuity(token, { serviceBaselineFingerprint: "server-new", assetVersion: "asset-v3", cursor: 5 });
    expect(result).toMatchObject({ status: "conflicted", localPreserved: true, serverAdvanced: true, action: "compare-or-save-candidate" });
  });

  it("marks expired tokens and requires a fresh navigation token", () => {
    const token = createWorkspaceContinuityToken({ ...base, expiresAt: "2000-01-01T00:00:00.000Z" });
    expect(reconcileWorkspaceContinuity(token, { serviceBaselineFingerprint: token.serviceBaselineFingerprint, assetVersion: token.assetVersion, cursor: token.sessionCursor })).toMatchObject({ status: "expired", action: "refresh-token" });
  });

  it("detects a local cache mismatch even when the server is unchanged", () => {
    const token = createWorkspaceContinuityToken(base);
    expect(reconcileWorkspaceContinuity(token, { serviceBaselineFingerprint: token.serviceBaselineFingerprint, assetVersion: "asset-v9", cursor: token.sessionCursor })).toMatchObject({ status: "conflicted", localPreserved: true, serverAdvanced: false });
  });
});
