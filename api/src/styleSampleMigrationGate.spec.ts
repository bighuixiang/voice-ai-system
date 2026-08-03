import { describe, expect, it } from "vitest";
import { migrateLegacyStyleSample } from "./styleSampleMigrationGate.js";
describe("legacy style sample", () => { it("does not inject excerpt", () => { expect(migrateLegacyStyleSample({ id: "s1", tags: ["tense"], excerpt: "private text", useCase: "draft" })).toEqual({ status: "legacy_unproven", excerptInjected: false, warning: "LEGACY_STYLE_SAMPLE_ISOLATED", requiresSupplementalSource: true }); }); });
