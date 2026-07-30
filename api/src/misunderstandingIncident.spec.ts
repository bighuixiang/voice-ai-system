import { describe, expect, it } from "vitest";
import { createMisunderstandingIncident, resolveMisunderstandingIncident } from "./misunderstandingIncident.js";

describe("misunderstanding incidents", () => {
  it("records the error layer, signal, impact and repair obligation", () => {
    const incident = createMisunderstandingIncident({ incidentId: "mi-1", projectSlug: "p1", signal: "author-correction", errorLayer: "inference", priorInterpretation: "summary", correctedInterpretation: "scene", affectedAssets: ["chapter-1"], repairPlan: "rebuild interpretation", regressionCase: "same correction must not recur" });
    expect(incident).toMatchObject({ status: "open", errorLayer: "inference", regressionCase: "same correction must not recur" });
  });

  it("cannot close without repair evidence and a regression result", () => {
    const incident = createMisunderstandingIncident({ incidentId: "mi-2", projectSlug: "p1", signal: "repeated-question", errorLayer: "questioning", priorInterpretation: "A", correctedInterpretation: "B", affectedAssets: ["q-1"], repairPlan: "deduplicate", regressionCase: "repeat input" });
    expect(() => resolveMisunderstandingIncident(incident, { repairEvidence: [], regressionResult: "" })).toThrow("MISUNDERSTANDING_REPAIR_EVIDENCE_REQUIRED");
    expect(resolveMisunderstandingIncident(incident, { repairEvidence: ["decision-1"], regressionResult: "passed" })).toMatchObject({ status: "resolved", repairEvidence: ["decision-1"], regressionResult: "passed" });
  });
});
