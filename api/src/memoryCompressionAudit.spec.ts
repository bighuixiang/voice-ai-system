import { describe, expect, it } from "vitest";
import { auditCompressedMemory } from "./memoryCompressionAudit.js";

describe("memory compression audit", () => {
  it("preserves tentative status, counter-evidence, and withdrawn direction relations", () => {
    const result = auditCompressedMemory({ endingStatus: "tentative", opposingEvidence: ["author://reject/old-ending"], withdrawnDirections: ["direction-old superseded-by direction-new"] });
    expect(result).toMatchObject({ preserved: true, endingStatus: "tentative", opposingEvidence: ["author://reject/old-ending"], withdrawnDirections: ["direction-old superseded-by direction-new"] });
  });

  it("fails closed when compression drops any of the three distinctions", () => {
    expect(auditCompressedMemory({ endingStatus: "tentative", opposingEvidence: [], withdrawnDirections: [] })).toMatchObject({ preserved: false, issues: ["OPPOSING_EVIDENCE_MISSING", "WITHDRAWN_DIRECTION_RELATION_MISSING"] });
  });
});
