import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRevisionIntent } from "./revisionIntent.js";
import { buildRevisionImpactReport } from "./revisionImpact.js";

describe("revision impact report", () => {
  it("computes transitive chapter impact from a dependency graph", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "revision-impact-"));
    const intent = await createRevisionIntent(root, { projectSlug: "demo", authorText: "Change the mentor reveal.", type: "direction_change", maturity: "settled", scope: { chapterIds: ["chapter-008"] }, requestedChanges: ["mentor motive"], protectedItems: ["chapter-008.paragraph-3"], mode: "branch_candidate", actor: "author" });
    await fs.mkdir(path.join(root, "sessions", "revisions"), { recursive: true });
    await fs.writeFile(path.join(root, "sessions", "revisions", "dependency-graph.json"), JSON.stringify({ edges: [{ from: "chapter-008", to: "chapter-009" }, { from: "chapter-009", to: "chapter-010" }] }));
    const report = await buildRevisionImpactReport(root, intent.intentId);
    expect(report).toMatchObject({ status: "needs_review", directChapterIds: ["chapter-008"], transitiveChapterIds: ["chapter-008", "chapter-009", "chapter-010"], unknownDependencies: [] });
    expect(report.protectedItems).toEqual(["chapter-008.paragraph-3"]);
  });

  it("fails safe when no dependency graph is available", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "revision-impact-unknown-"));
    const intent = await createRevisionIntent(root, { projectSlug: "demo", authorText: "Repair a local style issue.", type: "style_edit", maturity: "candidate_generated", scope: { chapterIds: ["chapter-001"] }, requestedChanges: ["local repair"], protectedItems: [], mode: "in_place", actor: "author" });
    const report = await buildRevisionImpactReport(root, intent.intentId);
    expect(report).toMatchObject({ status: "needs_review", transitiveChapterIds: ["chapter-001"], unknownDependencies: ["dependency-graph-missing"] });
  });
});
