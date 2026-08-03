import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createDecisionImpactReport, persistDecisionImpactReport, readDecisionImpactReport } from "./decisionImpact.js";
import type { DecisionRecord } from "./dialogueQuestions.js";

const decision = { schemaVersion: "decision-record.v1", decisionId: "decision-new", questionId: "q-1", projectSlug: "demo", questionVersion: 2, answerText: "new", answerStatus: "confirmed", status: "recorded", sourceFingerprint: "f".repeat(64), evidenceRefs: [{ kind: "dialogue-question", refId: "q-1" }], answerPayload: {} as never, canonWritten: false, createdAt: new Date().toISOString() } as DecisionRecord;

describe("decision impact report", () => {
  it("records only downstream consumers of a superseded decision", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "decision-impact-"));
    const report = createDecisionImpactReport({ decision, supersededDecisionId: "decision-old", affectedConsumers: [{ consumer: "story-contract", consumerRef: "candidate-1", receiptId: "receipt-1" }] });
    await expect(persistDecisionImpactReport(root, report)).resolves.toMatchObject({ created: true, report: { invalidation: "required" } });
    await expect(readDecisionImpactReport(root, report.reportId)).resolves.toMatchObject({ decisionId: "decision-new", supersededDecisionId: "decision-old", affectedConsumers: [{ consumerRef: "candidate-1" }] });
  });
});
