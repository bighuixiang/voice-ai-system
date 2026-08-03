import { describe, expect, it } from "vitest";
import { evaluateOutlineConfidence } from "./outlineConfidence.js";

const valid = {
  totalChapterCount: 5,
  strongFreezeCount: 3,
  nodes: [
    { nodeId: "ch-1", chapterOrder: 1, confidence: "rolling" as const, role: "chapter-detail" as const, detailLevel: "detailed" as const },
    { nodeId: "ch-2", chapterOrder: 2, confidence: "rolling" as const, role: "chapter-detail" as const, detailLevel: "detailed" as const },
    { nodeId: "ch-3", chapterOrder: 3, confidence: "rolling" as const, role: "chapter-detail" as const, detailLevel: "detailed" as const },
    { nodeId: "milestone-1", chapterOrder: 8, confidence: "tentative" as const, role: "milestone" as const, detailLevel: "milestone" as const },
    { nodeId: "ending-lock", chapterOrder: 99, confidence: "committed" as const, role: "constraint" as const, detailLevel: "constraint-only" as const }
  ]
};

describe("outline confidence horizon", () => {
  it("accepts a detailed rolling near horizon and evolvable far horizon", () => {
    expect(evaluateOutlineConfidence(valid)).toMatchObject({ status: "passed", issues: [] });
  });

  it("blocks tentative or exploratory nodes inside the strongly frozen window", () => {
    const report = evaluateOutlineConfidence({ ...valid, nodes: valid.nodes.map((node) => node.nodeId === "ch-2" ? { ...node, confidence: "tentative" as const } : node) });
    expect(report.status).toBe("blocked");
    expect(report.issues).toContain("NEAR_HORIZON_CONFIDENCE_TOO_LOW");
  });

  it("does not allow distant chapter detail to masquerade as committed canon", () => {
    const report = evaluateOutlineConfidence({ ...valid, nodes: valid.nodes.map((node) => node.nodeId === "milestone-1" ? { ...node, confidence: "committed" as const, detailLevel: "detailed" as const, role: "chapter-detail" as const } : node) });
    expect(report.status).toBe("blocked");
    expect(report.issues).toContain("DISTANT_DETAIL_OVERCOMMITTED");
  });

  it("requires a bounded 3-5 chapter strong freeze and unique IDs", () => {
    const report = evaluateOutlineConfidence({ ...valid, totalChapterCount: 8, strongFreezeCount: 2, nodes: [...valid.nodes, { ...valid.nodes[0], nodeId: "ch-1", chapterOrder: 6 }] });
    expect(report.status).toBe("blocked");
    expect(report.issues).toEqual(expect.arrayContaining(["HORIZON_RANGE_INVALID", "STRONG_FREEZE_INVALID", "CONFIDENCE_NODE_ID_DUPLICATE"]));
  });
});
