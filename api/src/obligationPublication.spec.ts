import { describe, expect, it } from "vitest";
import { createObligationEditorMarkers, freezeObligationPublication, evaluateObligationCompletionGate, migrateLegacyObligations } from "./obligationPublication.js";

describe("obligation publication and migration", () => {
  it("keeps editor markers outside manuscript text", () => {
    const result = createObligationEditorMarkers({ manuscriptText: "The door hummed.", markers: [{ obligationId: "obl-1", status: "setup", start: 4, end: 8 }] });
    expect(result.manuscriptText).toBe("The door hummed.");
    expect(result.markers[0]?.display).toBe("icon");
  });

  it("freezes obligation and evidence fingerprints per publication version", () => {
    const result = freezeObligationPublication({ publicationId: "pub-1", version: "v1", obligations: [{ obligationId: "obl-1", status: "paid", evidenceFingerprint: "e1" }] });
    expect(result.frozen).toBe(true);
    expect(result.readerView).not.toHaveProperty("evidenceFingerprint");
    expect(result.auditView.obligations[0]?.evidenceFingerprint).toBe("e1");
  });

  it("blocks completion when required obligations are open or evidence is stale", () => {
    const result = evaluateObligationCompletionGate({ required: [{ obligationId: "obl-1", status: "paid", evidenceFresh: true }, { obligationId: "obl-2", status: "open", evidenceFresh: true }, { obligationId: "obl-3", status: "paid", evidenceFresh: false }], sourceCoverageComplete: true });
    expect(result.status).toBe("blocked");
    expect(result.blockers).toEqual(expect.arrayContaining(["obl-2", "obl-3"]));
  });

  it("migrates legacy records as candidates without creating canon", () => {
    const result = migrateLegacyObligations({ records: [{ source: "ledger", id: "x1", text: "door mystery" }, { source: "scene-card", id: "x2", text: "promise" }] });
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0]?.status).toBe("candidate");
    expect(result.changesCanon).toBe(false);
  });
});
