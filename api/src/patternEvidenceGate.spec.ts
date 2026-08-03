import { describe, expect, it } from "vitest";
import { evaluatePatternEvidence } from "./patternEvidenceGate.js";
describe("pattern evidence", () => { it("rejects one-line model rationale", () => { expect(evaluatePatternEvidence({ positiveEvidence: [], counterexamples: [], boundaries: [] }).status).toBe("candidate"); }); });
