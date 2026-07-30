import { describe, expect, it } from "vitest";
import { createDialogueUtterance, atomizeIntent, createUnderstandingSnapshot, evaluateUnderstandingEvidence } from "./dialogueUnderstanding.js";

describe("dialogue understanding contract", () => {
  it("keeps immutable author source metadata and idempotency", () => {
    const utterance = createDialogueUtterance({ projectId: "demo", sessionId: "s-1", turn: 2, authorId: "author", text: "Keep the door mysterious.", clientTimestamp: "2026-07-30T00:00:00Z", language: "en", attachmentRefs: [], idempotencyKey: "u-1" });
    expect(utterance.text).toBe("Keep the door mysterious.");
    expect(utterance.idempotencyKey).toBe("u-1");
    expect(utterance.serverTimestamp).toBeTruthy();
  });

  it("atomizes multiple intents with source spans and target scope", () => {
    const atoms = atomizeIntent({ utteranceId: "u-1", text: "Keep the door mysterious; continue chapter one.", atoms: [{ atomId: "a-1", kind: "constraint", text: "Keep the door mysterious", start: 0, end: 24, targetAsset: "world-rule", scope: "project", relation: "preserve" }, { atomId: "a-2", kind: "command", text: "continue chapter one", start: 26, end: 46, targetAsset: "chapter-1", scope: "chapter", relation: "follow-up" }] });
    expect(atoms).toHaveLength(2);
    expect(atoms[0]?.sourceUtteranceId).toBe("u-1");
  });

  it("separates explicit, inferred, provisional, unknown and conflicted understanding", () => {
    const snapshot = createUnderstandingSnapshot({ snapshotId: "snap-1", sourceUtteranceIds: ["u-1"], explicit: ["door is mysterious"], inferred: ["door is dangerous"], provisional: ["door is a portal"], unknown: ["who built it"], conflicted: ["portal versus wreck"], nextAction: "ask one question" });
    expect(snapshot.inferred).toContain("door is dangerous");
    expect(snapshot.unknown).toContain("who built it");
  });

  it("requires supporting and opposing evidence for non-explicit confidence", () => {
    expect(evaluateUnderstandingEvidence({ status: "inferred", confidence: 0.7, supportingEvidence: ["u-1:0-10"], opposingEvidence: [], interpreterVersion: "v1", alternatives: ["portal", "wreck"] }).confidence).toBe(0.7);
    expect(() => evaluateUnderstandingEvidence({ status: "inferred", confidence: 0.7, supportingEvidence: [], opposingEvidence: [], interpreterVersion: "v1", alternatives: [] })).toThrow("UNDERSTANDING_EVIDENCE_REQUIRED");
  });
});
