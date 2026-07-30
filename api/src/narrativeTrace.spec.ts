import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createNarrativeTraceLink, listNarrativeTraceLinks, readNarrativeTraceLink, validateNarrativeTrace } from "./narrativeTrace.js";

const input = (root: string, linkId = "link-1") => ({ root, projectSlug: "demo", linkId, sourceLayer: "volume", sourceId: "volume-01", targetLayer: "chapter", targetId: "chapter-001", relation: "contains" as const, evidenceRefs: ["outline://volume-01"] });

describe("narrative trace link", () => {
  it("stores typed cross-layer links", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "trace-link-"));
    const link = await createNarrativeTraceLink(input(root));
    expect(link.schemaVersion).toBe("narrative-trace-link.v1");
    expect(link.relation).toBe("contains");
    expect(await readNarrativeTraceLink(root, link.linkId)).toEqual(link);
  });

  it("is idempotent and validates bidirectional coverage", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "trace-link-"));
    const link = await createNarrativeTraceLink(input(root));
    expect(await createNarrativeTraceLink(input(root))).toEqual(link);
    await createNarrativeTraceLink({ ...input(root, "link-2"), sourceLayer: "chapter", sourceId: "chapter-001", targetLayer: "scene", targetId: "scene-001", relation: "realized_by" });
    const report = await validateNarrativeTrace(root, "demo");
    expect(report.status).toBe("passed");
    expect(report.layers).toContain("volume");
    expect(await listNarrativeTraceLinks(root, "demo")).toHaveLength(2);
  });

  it("rejects missing endpoints or evidence", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "trace-link-"));
    await expect(createNarrativeTraceLink({ ...input(root), targetId: "" })).rejects.toThrow("NARRATIVE_TRACE_ENDPOINT_REQUIRED");
    await expect(createNarrativeTraceLink({ ...input(root), evidenceRefs: [] })).rejects.toThrow("NARRATIVE_TRACE_EVIDENCE_REQUIRED");
  });
});
