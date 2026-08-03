import { describe, expect, it } from "vitest";
import { evaluateForwardReadOnly } from "./forwardReadOnlyGate.js";
describe("forward read-only", () => { it("blocks unreplayable degraded events", () => { expect(evaluateForwardReadOnly({ eventType: "CANON_INVALIDATED", degraded: true, replayable: false }).status).toBe("blocked"); }); });
