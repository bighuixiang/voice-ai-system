import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { createProseGenerationManifest, evaluateProseCandidateFreshness, persistProseGenerationManifest, readCurrentProseGenerationManifest, readProseGenerationManifest } from "./proseGenerationManifest.js";

const valid = { manifestId: "manifest-1", decisionConsumptionReceiptRef: "receipt:prose-1", storyContractRef: "contract:v3", outlineVersion: "outline:v2", chapterIntentRef: "intent:ch-1", sceneCardRefs: ["scene:1"], characterStateRefs: ["state:hero:v4"], povStateRef: "pov:hero:v2", obligationRefs: ["obl:FS-1"], authorLockRefs: ["lock:p-1"], craftPatternRefs: ["craft:choice-cost:v1"], latestAuthorDirection: "make trust cost visible", proseBaselineRef: "prose:ch-1:v7", planningHorizonRef: "horizon:v2", contextManifestRef: "context:v5", sourceRefs: ["manifest://1"] };

describe("prose generation manifest", () => {
  it("freezes all required generation references", () => {
    const manifest = createProseGenerationManifest(valid);
    expect(manifest.status).toBe("frozen");
    expect(evaluateProseCandidateFreshness(manifest, manifest.fingerprint)).toBe("fresh");
  });

  it("marks candidate stale when any referenced manifest changes", () => {
    const manifest = createProseGenerationManifest(valid);
    expect(evaluateProseCandidateFreshness(manifest, "changed-fingerprint")).toBe("stale");
  });

  it("rejects incomplete references", () => {
    expect(() => createProseGenerationManifest({ ...valid, sceneCardRefs: [] })).toThrow("PROSE_MANIFEST_REFERENCE_REQUIRED");
    expect(() => createProseGenerationManifest({ ...valid, latestAuthorDirection: "" })).toThrow("PROSE_MANIFEST_DIRECTION_REQUIRED");
    expect(() => createProseGenerationManifest({ ...valid, decisionConsumptionReceiptRef: "" })).toThrow("PROSE_MANIFEST_DECISION_RECEIPT_REQUIRED");
  });

  it("fails closed when a rehashed persisted manifest has incomplete references", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "prose-manifest-semantic-"));
    const base = { ...valid, storyContractRef: "", sceneCardRefs: [], characterStateRefs: [], obligationRefs: [], authorLockRefs: [], craftPatternRefs: [], sourceRefs: [] , status: "frozen" as const };
    const fingerprint = crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex");
    await fs.mkdir(path.join(root, "sessions", "prose-generation-manifests"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions", "prose-generation-manifests", `${base.manifestId}.json`), JSON.stringify({ ...base, fingerprint }), "utf8");

    await expect(readProseGenerationManifest(root, base.manifestId)).rejects.toThrow("PROSE_MANIFEST_SEMANTIC_INVALID");
  });

  it("persists a frozen manifest immutably and replays the same record", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "prose-manifest-"));
    const manifest = createProseGenerationManifest(valid);
    await expect(persistProseGenerationManifest(root, manifest)).resolves.toEqual({ created: true, manifest });
    await expect(persistProseGenerationManifest(root, manifest)).resolves.toEqual({ created: false, manifest });
    await expect(readProseGenerationManifest(root, manifest.manifestId)).resolves.toEqual(manifest);
    const tampered = createProseGenerationManifest({ ...valid, latestAuthorDirection: "tampered" });
    await expect(persistProseGenerationManifest(root, { ...tampered, manifestId: manifest.manifestId })).rejects.toThrow("PROSE_MANIFEST_IMMUTABLE");
  });

  it("does not follow a current pointer redirected to another chapter intent", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "prose-manifest-pointer-scope-"));
    const first = createProseGenerationManifest(valid);
    const second = createProseGenerationManifest({ ...valid, manifestId: "manifest-2", chapterIntentRef: "intent:ch-2" });
    await persistProseGenerationManifest(root, first);
    await persistProseGenerationManifest(root, second);
    await fs.writeFile(path.join(root, "sessions", "prose-generation-manifests", "current", "intent-ch-1.json"), JSON.stringify({ manifestId: second.manifestId, fingerprint: second.fingerprint }), "utf8");

    await expect(readCurrentProseGenerationManifest(root, first.chapterIntentRef)).resolves.toBeNull();
  });
});
