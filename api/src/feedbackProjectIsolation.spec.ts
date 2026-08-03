import { describe, expect, it } from "vitest";
import { isolateFeedbackProject } from "./feedbackProjectIsolation.js";

describe("feedback project isolation", () => {
  it("excludes project A feedback from project B and keeps only event-existence audit after forgetting", () => {
    expect(isolateFeedbackProject({ projectSlug: "A", requestedProjectSlug: "B", forgotten: false, publishedAuditRefs: [] })).toMatchObject({ allowed: false, futureContext: "exclude" });
    expect(isolateFeedbackProject({ projectSlug: "A", requestedProjectSlug: "A", forgotten: true, publishedAuditRefs: ["feedback-event://1"] })).toMatchObject({ futureContext: "exclude", audit: { retainEventExistence: true, refs: ["feedback-event://1"] } });
  });
});
