import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { assertResearchFactCheckIntegrity } from "./researchFactCheck.js";
import { createResearchClaim, createResearchSourceSnapshot } from "./researchGrounding.js";
import { evaluateResearchFactCheck } from "./researchFactCheck.js";
import { persistResearchFactCheck, readResearchFactCheck } from "./researchFactCheck.js";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const source = createResearchSourceSnapshot({ sourceId: "source-fact", sourceType: "web", author: "Archive", title: "Record", publishedAt: "2025-01-01", retrievedAt: "2026-07-31", region: "CN", locator: "https://archive.test/record", contentHash: "fact-hash", acquisition: "browser", rights: "quote", reliabilitySignals: ["official"], expiry: "2027-01-01", rawContent: "The bridge opened in 1920 after the flood." });
const claim = createResearchClaim({ claimId: "claim-fact", sourceSnapshotId: source.sourceId, sourceText: "The bridge opened in 1920", paraphrase: "Bridge opened in 1920", status: "supported", anchor: "source://source-fact#1-20", region: "CN", asOf: "2025-01-01", conditions: [], counterEvidence: [], independentSourceIds: [source.sourceId] });

describe("research fact checking", () => {
  it("requires an anchored excerpt that exists in the frozen source", () => {
    expect(evaluateResearchFactCheck({ claim, source, evidenceExcerpt: "The bridge opened in 1920" })).toMatchObject({ status: "supported", reasons: [], claimFingerprint: claim.fingerprint });
    expect(evaluateResearchFactCheck({ claim, source, evidenceExcerpt: "The bridge opened in 1930" }).reasons).toContain("EVIDENCE_EXCERPT_NOT_IN_SOURCE");
  });

  it("blocks missing or mismatched source anchors instead of inferring support", () => {
    expect(evaluateResearchFactCheck({ claim: { ...claim, anchor: "source://other#1" }, source, evidenceExcerpt: "The bridge opened in 1920" }).reasons).toContain("CLAIM_ANCHOR_MISMATCH");
    expect(evaluateResearchFactCheck({ claim, source: null, evidenceExcerpt: "The bridge opened in 1920" }).reasons).toContain("SOURCE_SNAPSHOT_MISSING");
  });

  it("persists fact-check evidence immutably for replay", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "research-fact-check-"));
    const result = evaluateResearchFactCheck({ claim, source, evidenceExcerpt: "The bridge opened in 1920" });
    await expect(persistResearchFactCheck(root, result)).resolves.toMatchObject({ created: true, factCheck: result });
    await expect(persistResearchFactCheck(root, result)).resolves.toMatchObject({ created: false, factCheck: result });
    await expect(readResearchFactCheck(root, result.claimId)).resolves.toEqual(result);
    const replacement = evaluateResearchFactCheck({ claim, source, evidenceExcerpt: "The bridge opened in 1930" });
    await expect(persistResearchFactCheck(root, replacement)).rejects.toThrow("RESEARCH_FACT_CHECK_IMMUTABLE");
  });

  it("rejects a rehashed supported result that still contains blocking reasons", () => {
    const result = evaluateResearchFactCheck({ claim, source, evidenceExcerpt: "The bridge opened in 1920" });
    const { fingerprint: _fingerprint, ...base } = result;
    const forgedBase = { ...base, status: "supported" as const, reasons: ["FORGED_REASON"] };
    const forged = { ...forgedBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(forgedBase)).digest("hex") };
    expect(() => assertResearchFactCheckIntegrity(forged as typeof result)).toThrow("RESEARCH_FACT_CHECK_INTEGRITY_FAILED");
  });
});
