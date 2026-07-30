import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createNarrativeCurvePoint, listNarrativeCurvePoints, readNarrativeCurvePoint } from "./narrativeCurve.js";

const input = (root: string, pointId = "curve-1") => ({ root, projectSlug: "demo", pointId, chapterId: "chapter-001", sceneId: "scene-001", dimensions: { pressure: 70, information: 40, emotion: 65, relationship: 55, progression: 20, payoff: 10 }, whiteSpace: ["quiet after warning"], evidenceRefs: ["chapter://1#scene"] });

describe("narrative curve point", () => {
  it("stores dimensions independently with evidence", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "curve-point-"));
    const point = await createNarrativeCurvePoint(input(root));
    expect(point.schemaVersion).toBe("narrative-curve-point.v1");
    expect(point.dimensions.pressure).toBe(70);
    expect((point as { overall?: number }).overall).toBeUndefined();
    expect(await readNarrativeCurvePoint(root, point.pointId)).toEqual(point);
  });

  it("is idempotent and project-isolated", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "curve-point-"));
    const point = await createNarrativeCurvePoint(input(root));
    expect(await createNarrativeCurvePoint(input(root))).toEqual(point);
    expect(await listNarrativeCurvePoints(root, "other")).toEqual([]);
    expect(await listNarrativeCurvePoints(root, "demo")).toHaveLength(1);
  });

  it("rejects out-of-range dimensions and missing evidence", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "curve-point-"));
    await expect(createNarrativeCurvePoint({ ...input(root), dimensions: { ...input(root).dimensions, pressure: 101 } })).rejects.toThrow("NARRATIVE_CURVE_DIMENSION_RANGE");
    await expect(createNarrativeCurvePoint({ ...input(root), evidenceRefs: [] })).rejects.toThrow("NARRATIVE_CURVE_EVIDENCE_REQUIRED");
  });
});
