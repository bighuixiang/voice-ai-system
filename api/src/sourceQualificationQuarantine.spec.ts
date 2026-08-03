import { describe, expect, it } from "vitest";
import { quarantineUnresolvedSource } from "./sourceQualificationQuarantine.js";
describe("source qualification quarantine", () => { it("isolates unresolved source and candidates", () => { expect(quarantineUnresolvedSource({ sourceFamilyKnown: false, accessCategoryKnown: true, deletionStatusKnown: true, rawText: "excerpt", candidateCount: 2, qualificationResolved: false })).toMatchObject({ status: "quarantined", searchable: false, promptEligible: false, isolatedCandidateCount: 2 }); }); });
