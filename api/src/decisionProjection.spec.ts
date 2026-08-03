import { describe, expect, it } from "vitest";
import { assertDecisionProjectionIntegrity, projectDecisionRecords } from "./decisionProjection.js";
import type { DecisionRecord } from "./dialogueQuestions.js";

const record = (id: string, questionVersion: number, supersedesDecisionId?: string) => ({ schemaVersion: "decision-record.v1", decisionId: id, questionId: "q-1", projectSlug: "demo", questionVersion, answerText: id, answerStatus: "confirmed", status: "recorded", sourceFingerprint: "f".repeat(64), evidenceRefs: [{ kind: "dialogue-question", refId: "q-1" }], answerPayload: {} as never, canonWritten: false, ...(supersedesDecisionId ? { supersedesDecisionId } : {}), createdAt: new Date().toISOString() }) as DecisionRecord;

describe("decision projection", () => {
  it("keeps only the latest non-superseded decision while retaining history", () => {
    const projection = projectDecisionRecords([record("old", 1), record("new", 2, "old")], "demo");
    expect(projection).toMatchObject({ schemaVersion: "decision-projection.v1", historyCount: 2, supersededDecisionIds: ["old"], current: [expect.objectContaining({ decisionId: "new" })] });
    expect(() => assertDecisionProjectionIntegrity(projection)).not.toThrow();
  });
});
