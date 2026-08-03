import { describe, expect, it } from "vitest";
import { evaluateCraftPattern } from "./craftPatternGate.js";
describe("craft pattern", () => { it("rejects adjective-only extraction", () => { expect(evaluateCraftPattern({ trigger: "", informationChange: "", characterChoice: "", readerEffect: "", cost: "", boundary: "", counterexample: "" }).status).toBe("blocked"); }); });
