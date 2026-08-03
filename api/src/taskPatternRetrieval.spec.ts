import { describe, expect, it } from "vitest";
import { assertTaskPatternRetrievalIntegrity, buildTaskPatternRetrieval } from "./taskPatternRetrieval.js";

const input = { projectSlug: "demo", sceneFunction: "investigation", targetGap: "公平埋伏笔", genreProfile: "mystery", authorPreferences: ["avoid direct emotion summary"], sourceEligibility: "default_allowed" as const, applicablePatternIds: ["p1", "p2"], sourceFamilies: ["public-interview"], evidenceSnapshots: [{ patternId: "p1", snapshotId: "snap-1", reason: "matches boundary" }, { patternId: "p2", snapshotId: "snap-2", reason: "analysis only" }], budget: { maxPatterns: 1, timeWindowMs: 1000 }, sourceRefs: ["retrieval://query-1"] };
describe("task-oriented pattern retrieval", () => {
  it("selects patterns by task and records replayable manifest", () => { const result = buildTaskPatternRetrieval(input); expect(result.selectedPatternIds).toEqual(["p1"]); expect(result.queries).toContain("investigation|公平埋伏笔|mystery"); expect(result.truncatedPatternIds).toEqual(["p2"]); });
  it("excludes ineligible sources and records reasons", () => { const result = buildTaskPatternRetrieval({ ...input, sourceEligibility: "analysis_only" }); expect(result.selectedPatternIds).toEqual([]); expect(result.excluded[0].reason).toBe("SOURCE_ANALYSIS_ONLY"); });
  it("requires budget, boundaries and evidence", () => { expect(() => buildTaskPatternRetrieval({ ...input, budget: { maxPatterns: 0, timeWindowMs: 0 } })).toThrow("RETRIEVAL_BUDGET_REQUIRED"); expect(() => buildTaskPatternRetrieval({ ...input, sourceRefs: [] })).toThrow("RETRIEVAL_EVIDENCE_REQUIRED"); });
  it("rejects duplicate or malformed candidates and detects tampering", () => { expect(() => buildTaskPatternRetrieval({ ...input, applicablePatternIds: ["p1", "p1"] })).toThrow("RETRIEVAL_PATTERN_IDS_INVALID"); expect(() => buildTaskPatternRetrieval({ ...input, evidenceSnapshots: [{ patternId: "p1", snapshotId: "", reason: "x" }] })).toThrow("RETRIEVAL_SNAPSHOT_INVALID"); const result = buildTaskPatternRetrieval(input); expect(() => assertTaskPatternRetrievalIntegrity({ ...result, projectSlug: "tampered" })).toThrow("RETRIEVAL_INTEGRITY_FAILED"); });
  it("records purpose, relevance, freshness, versions, and excludes low-signal candidates", () => {
    const result = buildTaskPatternRetrieval({ ...input, evidenceSnapshots: [
      { patternId: "p1", snapshotId: "snap-1", reason: "direct match", relevance: 0.9, freshness: 0.8, sourceVersion: "v3" },
      { patternId: "p2", snapshotId: "snap-2", reason: "weak match", relevance: 0.2, freshness: 0.9, sourceVersion: "v2" }
    ] });
    expect(result.purpose).toBe("investigation|公平埋伏笔");
    expect(result.selectedPatternIds).toEqual(["p1"]);
    expect(result.evidenceSnapshots[0]).toMatchObject({ relevance: 0.9, freshness: 0.8, sourceVersion: "v3" });
    expect(result.excluded).toEqual(expect.arrayContaining([{ patternId: "p2", reason: "LOW_RELEVANCE" }]));
  });
});
