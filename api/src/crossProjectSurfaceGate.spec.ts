import { describe, expect, it } from "vitest";
import { evaluateCrossProjectSurface } from "./crossProjectSurfaceGate.js";
describe("cross project surface", () => { it("blocks private surface transfer", () => { expect(evaluateCrossProjectSurface({ sourceProject: "A", targetProject: "B", copiedSurface: true, approvedAbstractMechanism: true, sourcePrivateFactPresent: false }).status).toBe("blocked"); }); });
