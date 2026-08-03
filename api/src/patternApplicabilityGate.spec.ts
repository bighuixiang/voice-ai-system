import { describe, expect, it } from "vitest";
import { evaluatePatternApplicability } from "./patternApplicabilityGate.js";
describe("pattern applicability", () => { it("excludes mismatched chapter function", () => { expect(evaluatePatternApplicability({ patternFunction: "chase", chapterFunction: "aftermath", compatible: false, reason: "relationship_consequence" })).toMatchObject({ status: "excluded", addToPrompt: false }); }); });
