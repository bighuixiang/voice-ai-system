import { describe, expect, it } from "vitest";
import { auditFirstSlice } from "./firstSliceReadiness.js";

describe("first slice readiness", () => {
  it("requires persisted utterance, session, snapshot, one question, and restart recovery", () => {
    expect(auditFirstSlice({ authorUtterancePersisted: true, sessionPersisted: true, understandingSnapshotPersisted: true, uniqueQuestionCount: 1, survivesRestart: true, canonWritten: false })).toMatchObject({ status: "ready", blockers: [], canonWritten: false });
  });
  it("blocks a chat-only implementation that loses state on refresh", () => {
    expect(auditFirstSlice({ authorUtterancePersisted: false, sessionPersisted: false, understandingSnapshotPersisted: false, uniqueQuestionCount: 2, survivesRestart: false, canonWritten: false }).status).toBe("blocked");
  });
});
