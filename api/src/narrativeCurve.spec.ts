import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { assessNarrativeCurve, createNarrativeCurvePoint, listNarrativeCurvePoints, readNarrativeCurvePoint } from "./narrativeCurve.js";
import crypto from "node:crypto";

const input = (root: string, pointId = "curve-1") => ({ root, projectSlug: "demo", pointId, chapterId: "chapter-001", sceneId: "scene-001", dimensions: { pressure: 70, information: 40, emotion: 65, relationship: 55, progression: 20, payoff: 10 }, whiteSpace: ["quiet after warning"], evidenceRefs: ["chapter://1#scene"] });

describe("narrative curve point", () => {
  const curve = (pressure: number, information: number, emotion: number, relationship: number, progression: number, payoff: number) => ({ dimensions: { pressure, information, emotion, relationship, progression, payoff } });

  it("reports explainable fatigue risks for continuous pressure and payoff debt", () => {
    const report = assessNarrativeCurve([curve(90, 70, 70, 50, 30, 5), curve(88, 68, 72, 50, 30, 10), curve(92, 75, 74, 48, 25, 5), curve(86, 72, 76, 46, 30, 10)]);
    expect(report.status).toBe("risk");
    expect(report.riskCodes).toEqual(expect.arrayContaining(["CONTINUOUS_HIGH_PRESSURE", "PAYOFF_DEFICIT"]));
    expect(report.evidence.every((item) => item.startIndex <= item.endIndex && item.detail.length > 0)).toBe(true);
  });

  it("reports low-change fatigue without collapsing the independent dimensions", () => {
    const report = assessNarrativeCurve([curve(35, 15, 20, 30, 10, 10), curve(38, 14, 21, 30, 12, 12), curve(36, 16, 19, 31, 8, 8)]);
    expect(report.status).toBe("risk");
    expect(report.riskCodes).toContain("CONTINUOUS_LOW_CHANGE");
  });

  it("keeps a varied curve clear and requires points", () => {
    expect(assessNarrativeCurve([curve(30, 20, 25, 20, 40, 15), curve(75, 65, 70, 50, 60, 35), curve(45, 80, 40, 70, 80, 65)]).status).toBe("clear");
    expect(() => assessNarrativeCurve([])).toThrow("NARRATIVE_CURVE_POINTS_REQUIRED");
  });

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

  it("fails closed when a re-signed point introduces an unknown dimension", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "curve-point-tamper-"));
    const point = await createNarrativeCurvePoint(input(root));
    const target = path.join(root, "sessions", "narrative-curve-points", `${point.pointId}.json`);
    const { fingerprint: _old, ...base } = JSON.parse(await fs.readFile(target, "utf8")) as Record<string, unknown>;
    const dimensions = base.dimensions as Record<string, unknown>;
    const resigned = { ...base, dimensions: { ...dimensions, overall: 50 } };
    resigned.fingerprint = crypto.createHash("sha256").update(JSON.stringify(resigned)).digest("hex");
    await fs.writeFile(target, JSON.stringify(resigned), "utf8");
    await expect(readNarrativeCurvePoint(root, point.pointId)).rejects.toThrow("NARRATIVE_CURVE_INTEGRITY_FAILED");
  });
});
