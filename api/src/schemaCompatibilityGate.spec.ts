import { describe, expect, it } from "vitest";
import { checkDialogueQuestionSchema } from "./schemaCompatibilityGate.js";
describe("schema compatibility gate", () => { it("fails before release when API adds a UI-unknown status", () => { expect(checkDialogueQuestionSchema({ apiStatuses: ["active", "answered", "awaiting_author"], uiKnownStatuses: ["active", "answered"] })).toEqual({ compatible: false, unknownStatuses: ["awaiting_author"] }); }); });
