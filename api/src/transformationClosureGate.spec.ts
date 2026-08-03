import { describe, expect, it } from "vitest";
import { evaluateTransformationClosure } from "./transformationClosureGate.js";

describe("transformation closure gate", () => {
  const base = { transformationId: "transform-1", priorStatus: "overdue" as const, mainlineSubclaimsAnswered: false, readerFairnessEvidence: [], sequelInheritanceVerified: false, authorAuthorized: false };
  it("does not wash away overdue status or incomplete obligations", () => expect(evaluateTransformationClosure(base)).toMatchObject({ status: "blocked", overduePreserved: true, reasons: expect.arrayContaining(["MAINLINE_SUBCLAIMS_INCOMPLETE"]) }));
  it("passes only after mainline, fairness, inheritance and authorization evidence exist", () => expect(evaluateTransformationClosure({ ...base, mainlineSubclaimsAnswered: true, readerFairnessEvidence: ["reader://fairness/1"], sequelInheritanceVerified: true, authorAuthorized: true })).toMatchObject({ status: "passed", overduePreserved: true, reasons: [] }));
});
