import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { captureAuthorUtterance, buildStorySeedFrame, createSeedInterpretationSet, persistAuthorUtterance, persistSeedInterpretationSet, persistStorySeedFrame, readAuthorUtterances, readSeedInterpretationSets, readStorySeedFrames } from "./storySeed.js";

describe("story seed compilation", () => {
  it("captures the exact utterance with an idempotency key before interpretation", () => {
    const utterance = captureAuthorUtterance({ projectId: "demo", text: "A courier finds a door beneath the sea.", idempotencyKey: "m-1" });
    expect(utterance.text).toBe("A courier finds a door beneath the sea.");
    expect(utterance.status).toBe("captured");
    expect(utterance.idempotencyKey).toBe("m-1");
  });

  it("keeps facets evidence-bound and absent facts unknown", () => {
    const frame = buildStorySeedFrame({ utterance: captureAuthorUtterance({ projectId: "demo", text: "A courier finds a door beneath the sea.", idempotencyKey: "m-2" }), facets: [{ facet: "protagonist", value: "courier", evidence: [{ start: 2, end: 9 }] }, { facet: "desire", value: "unknown", evidence: [] }] });
    expect(frame.facets.find((item) => item.facet === "desire")?.certainty).toBe("unknown");
    expect(() => buildStorySeedFrame({ utterance: frame.utterance, facets: [{ facet: "trauma", value: "secret trauma", evidence: [] }] })).toThrow("SEED_EVIDENCE_REQUIRED");
  });

  it("preserves divergent interpretations and common facts without choosing canon", () => {
    const frame = buildStorySeedFrame({ utterance: captureAuthorUtterance({ projectId: "demo", text: "A courier finds a door beneath the sea.", idempotencyKey: "m-3" }), facets: [{ facet: "protagonist", value: "courier", evidence: [{ start: 2, end: 9 }] }] });
    const set = createSeedInterpretationSet({ frame, interpretations: [{ interpretationId: "i-1", differences: ["door is portal"], downstreamImpact: ["world rules"], supports: ["door"], contradictions: [] }, { interpretationId: "i-2", differences: ["door is wreck"], downstreamImpact: ["mystery"], supports: ["sea"], contradictions: [] }] });
    expect(set.status).toBe("unresolved");
    expect(set.commonFacets).toContain("protagonist");
  });

  it("persists idempotent utterances and fails closed on tampered storage", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "story-seed-"));
    const utterance = captureAuthorUtterance({ projectId: "demo", text: "The exact seed survives a restart.", idempotencyKey: "m-4" });
    await expect(persistAuthorUtterance(root, utterance)).resolves.toMatchObject({ created: true });
    await expect(persistAuthorUtterance(root, utterance)).resolves.toMatchObject({ created: false });
    await expect(readAuthorUtterances(root, "demo")).resolves.toEqual([utterance]);
    await fs.writeFile(path.join(root, "sessions", "author-utterances.json"), JSON.stringify([{ ...utterance, text: "tampered" }]), "utf8");
    await expect(readAuthorUtterances(root, "demo")).rejects.toThrow("AUTHOR_UTTERANCE_INTEGRITY_FAILED");
    await fs.rm(root, { recursive: true, force: true });
  });

  it("persists an evidence-bound frame by utterance and rejects tampering", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "story-frame-"));
    const utterance = captureAuthorUtterance({ projectId: "demo", text: "A courier finds a door beneath the sea.", idempotencyKey: "frame-1" });
    const frame = buildStorySeedFrame({ utterance, facets: [{ facet: "protagonist", value: "courier", evidence: [{ start: 2, end: 9 }] }] });
    await expect(persistStorySeedFrame(root, frame)).resolves.toMatchObject({ created: true });
    await expect(readStorySeedFrames(root, "demo")).resolves.toEqual([frame]);
    await fs.writeFile(path.join(root, "sessions", "story-seed-frames.json"), JSON.stringify([{ ...frame, utterance: { ...utterance, text: "forged" } }]), "utf8");
    await expect(readStorySeedFrames(root, "demo")).rejects.toThrow("STORY_SEED_FRAME_INTEGRITY_FAILED");
    await fs.rm(root, { recursive: true, force: true });
  });

  it("persists competing interpretations by frame fingerprint and detects tampering", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "story-interpretations-"));
    const utterance = captureAuthorUtterance({ projectId: "demo", text: "A courier finds a door beneath the sea.", idempotencyKey: "interpret-1" });
    const frame = buildStorySeedFrame({ utterance, facets: [{ facet: "protagonist", value: "courier", evidence: [{ start: 2, end: 9 }] }] });
    const set = createSeedInterpretationSet({ frame, interpretations: [{ interpretationId: "i-1", differences: ["portal"], downstreamImpact: ["rules"], supports: ["protagonist"], contradictions: [] }, { interpretationId: "i-2", differences: ["wreck"], downstreamImpact: ["mystery"], supports: ["protagonist"], contradictions: [] }] });
    await expect(persistSeedInterpretationSet(root, set)).resolves.toMatchObject({ created: true });
    await expect(readSeedInterpretationSets(root, "demo")).resolves.toEqual([set]);
    await fs.writeFile(path.join(root, "sessions", "seed-interpretation-sets.json"), JSON.stringify([{ ...set, status: "resolved" }]), "utf8");
    await expect(readSeedInterpretationSets(root, "demo")).rejects.toThrow("SEED_INTERPRETATION_SET_INTEGRITY_FAILED");
    await fs.rm(root, { recursive: true, force: true });
  });
});
