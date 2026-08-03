import { describe, expect, it } from "vitest";
import { createStableDeepLink, resolveStableDeepLink } from "./stableDeepLink.js";

describe("stable deep links", () => {
  it("creates a versioned link and focuses the target when current", () => {
    const link = createStableDeepLink({ projectSlug: "demo", kind: "decision", assetId: "d-1", assetVersion: "v1" });
    expect(link.href).toContain("novel://demo/decision/d-1");
    expect(resolveStableDeepLink({ link, authorized: true, currentVersion: "v1" })).toMatchObject({ status: "focused", focus: "d-1" });
  });
  it("falls back to a current version or denies without leaking the target", () => {
    const link = createStableDeepLink({ projectSlug: "demo", kind: "question", assetId: "q-old", assetVersion: "v1" });
    expect(resolveStableDeepLink({ link, authorized: true, currentVersion: "v2", fallbackAssetId: "q-new", fallbackVersion: "v2" })).toMatchObject({ status: "fallback", target: { assetId: "q-new" } });
    expect(resolveStableDeepLink({ link, authorized: false })).toMatchObject({ status: "denied", focus: "permission-boundary" });
  });
});
