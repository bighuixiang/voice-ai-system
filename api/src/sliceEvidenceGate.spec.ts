import { describe, expect, it } from "vitest";
import { evaluateSliceEvidence } from "./sliceEvidenceGate.js";
describe("slice evidence", () => { it("rejects snapshot-only proof", () => { expect(evaluateSliceEvidence({ evidence: ["component_snapshot", "http_200"] }).status).toBe("blocked"); }); it("verifies the complete failure-path pack", () => { expect(evaluateSliceEvidence({ evidence: ["schema", "api", "ui", "refresh_restart", "duplicate_message", "concurrent_answer", "projection_rebuild", "real_executor"] }).status).toBe("verified"); }); });
