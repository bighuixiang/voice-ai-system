import { describe, expect, it } from "vitest";
import { enforceServerCapability } from "./serverCapabilityGate.js";
describe("server capability gate", () => { it("rejects a direct feedback write when feedback.v1 is not activated", () => { expect(enforceServerCapability({ enabledCapabilities: ["journey.v1"], requiredCapability: "feedback.v1", migrationPreviewRef: "migration://feedback" })).toMatchObject({ status: "capability_not_activated", migrationPreviewRef: "migration://feedback", writes: false }); }); });
