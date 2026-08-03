import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { assertAdaptivePauseRecapIntegrity, createAdaptivePauseRecap, persistAdaptivePauseRecap, readAdaptivePauseRecap } from "./adaptivePauseRecap.js";

const input = () => ({
  projectSlug: "demo",
  recapId: "recap-10",
  trigger: "ten-settled-chapters" as const,
  settledChapterCount: 10,
  settledSummary: "Ten chapters settled.",
  changedSummary: "The key relationship remains unchanged.",
  openRisks: ["one unresolved obligation"],
  qualityEvidence: ["quality://chapter-010"],
  costEvidence: ["cost://run-010"],
  paceEvidence: ["pace://forecast-010"],
  nextAuthorizedScope: "Continue within the existing chapter scope.",
  continuationSafeReason: "No hard pause trigger is active and the grant remains valid."
});

describe("adaptive pause recaps", () => {
  it("persists a milestone recap without recording author silence as consent", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "adaptive-pause-recap-"));
    const recap = createAdaptivePauseRecap(input());
    expect(recap).toMatchObject({ trigger: "ten-settled-chapters", authorResponse: "not-required", continuationRequiresExistingGrant: true });
    await persistAdaptivePauseRecap(root, recap);
    expect(await readAdaptivePauseRecap(root, recap.recapId)).toMatchObject({ fingerprint: recap.fingerprint, nextAuthorizedScope: input().nextAuthorizedScope });
  });

  it("fails closed when a persisted recap is tampered", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "adaptive-pause-recap-tamper-"));
    const recap = createAdaptivePauseRecap(input());
    await persistAdaptivePauseRecap(root, recap);
    const target = path.join(root, "sessions", "pause-policy", "recaps", `${recap.recapId}.json`);
    const value = JSON.parse(await fs.readFile(target, "utf8")) as Record<string, unknown>;
    value.nextAuthorizedScope = "expanded scope";
    await fs.writeFile(target, JSON.stringify(value), "utf8");
    await expect(readAdaptivePauseRecap(root, recap.recapId)).rejects.toThrow("ADAPTIVE_PAUSE_RECAP_INTEGRITY_FAILED");
  });
  it("rejects a forged recap before persistence", async () => { const root = await fs.mkdtemp(path.join(os.tmpdir(), "adaptive-pause-recap-forged-")); const recap = createAdaptivePauseRecap(input()); const { fingerprint: _fingerprint, ...base } = recap; const forgedBase = { ...base, continuationRequiresExistingGrant: false }; const forged = { ...forgedBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(forgedBase)).digest("hex") }; expect(() => assertAdaptivePauseRecapIntegrity(forged as typeof recap)).toThrow("ADAPTIVE_PAUSE_RECAP_INTEGRITY_FAILED"); await expect(persistAdaptivePauseRecap(root, forged as typeof recap)).rejects.toThrow("ADAPTIVE_PAUSE_RECAP_INTEGRITY_FAILED"); });
});
