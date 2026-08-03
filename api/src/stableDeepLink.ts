import crypto from "node:crypto";

export type DeepLinkKind = "question" | "decision" | "candidate" | "chapter-evidence" | "obligation" | "audit";
export interface StableDeepLink { schemaVersion: "stable-deep-link.v1"; projectSlug: string; kind: DeepLinkKind; assetId: string; assetVersion: string; href: string; fingerprint: string; }
export interface DeepLinkResolution { schemaVersion: "stable-deep-link-resolution.v1"; status: "focused" | "fallback" | "denied"; target: StableDeepLink; focus: string; reason?: string; fingerprint: string; }
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function createStableDeepLink(input: { projectSlug: string; kind: DeepLinkKind; assetId: string; assetVersion: string }): StableDeepLink {
  if (!input.projectSlug.trim() || !input.assetId.trim() || !input.assetVersion.trim()) throw new Error("DEEP_LINK_FIELDS_REQUIRED");
  const href = `novel://${encodeURIComponent(input.projectSlug)}/${input.kind}/${encodeURIComponent(input.assetId)}?version=${encodeURIComponent(input.assetVersion)}`;
  const base = { schemaVersion: "stable-deep-link.v1" as const, ...input, href };
  return { ...base, fingerprint: hash(base) };
}

export function resolveStableDeepLink(input: { link: StableDeepLink; authorized: boolean; currentVersion?: string; fallbackAssetId?: string; fallbackVersion?: string }): DeepLinkResolution {
  if (!input.authorized) {
    const base = { schemaVersion: "stable-deep-link-resolution.v1" as const, status: "denied" as const, target: input.link, focus: "permission-boundary", reason: "TARGET_NOT_AUTHORIZED" };
    return { ...base, fingerprint: hash(base) };
  }
  if (input.currentVersion && input.currentVersion !== input.link.assetVersion) {
    const fallback = input.fallbackAssetId && input.fallbackVersion ? createStableDeepLink({ projectSlug: input.link.projectSlug, kind: input.link.kind, assetId: input.fallbackAssetId, assetVersion: input.fallbackVersion }) : input.link;
    const base = { schemaVersion: "stable-deep-link-resolution.v1" as const, status: "fallback" as const, target: fallback, focus: "current-version", reason: "TARGET_VERSION_STALE" };
    return { ...base, fingerprint: hash(base) };
  }
  const base = { schemaVersion: "stable-deep-link-resolution.v1" as const, status: "focused" as const, target: input.link, focus: input.link.assetId };
  return { ...base, fingerprint: hash(base) };
}
