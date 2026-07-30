import { describe, expect, it } from "vitest";
import { transformForeshadowing, detectForeshadowingConflict, evaluateForeshadowingWindow, planForeshadowingRepair, authorizeForeshadowingWaiver, projectForeshadowingVisibility, freezeForeshadowingPublication, migrateLegacyForeshadowing } from "./foreshadowingGovernance.js";

describe("foreshadowing governance", () => {
  it("transforms a foreshadowing item with preserved lineage", () => {
    const result = transformForeshadowing({ sourceId: "FS-demo-1", targetId: "obl-1", targetType: "relationship_debt", reason: "door answer creates debt", preservedEvidence: ["manuscript://v1#1-2"], inheritedPayoffWindow: "chapter-8" });
    expect(result.parentId).toBe("FS-demo-1");
  });

  it("blocks incompatible foreshadowing requirements", () => {
    const result = detectForeshadowingConflict({ conflictId: "c-1", items: [{ id: "FS-1", requirement: "door opens", window: "chapter-5" }, { id: "FS-2", requirement: "door never opens", window: "chapter-5" }], alternatives: ["split interpretation"] });
    expect(result.status).toBe("blocked");
  });

  it("tracks semantic windows and produces minimal repair routes", () => {
    expect(evaluateForeshadowingWindow({ itemId: "FS-1", currentMilestone: "after-door", targetMilestone: "after-door", hardness: "hard", resolved: false }).status).toBe("overdue");
    expect(planForeshadowingRepair({ itemId: "FS-1", routes: [{ kind: "add-evidence", cost: 1 }, { kind: "rewrite-chapter", cost: 9 }] }).recommended.kind).toBe("add-evidence");
  });

  it("requires explicit author intent for a waiver and redacts secret meaning", () => {
    expect(authorizeForeshadowingWaiver({ itemId: "FS-1", authorIntent: "leave open for sequel", riskAcknowledged: true, readerFairness: "contracted-open", keepSequelHook: true }).status).toBe("waived");
    expect(projectForeshadowingVisibility({ meaning: "portal", surface: "hums", label: "FS-1" }, "reader")).toEqual({ label: "FS-1", surface: "hums" });
  });

  it("freezes publication and migrates legacy items as candidates", () => {
    const publication = freezeForeshadowingPublication({ publicationId: "pub-1", version: "v1", items: [{ id: "FS-1", status: "resolved", evidenceFingerprint: "e1" }] });
    expect(publication.readerItems[0]).not.toHaveProperty("evidenceFingerprint");
    expect(migrateLegacyForeshadowing({ records: [{ source: "ledger", id: "x", text: "old clue" }] }).changesCanon).toBe(false);
  });
});
