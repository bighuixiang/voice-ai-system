import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createSeedAssetImpactReport, persistSeedAssetImpactReport, readSeedAssetImpactReport } from "./seedAssetImpact.js";

describe("seed to asset impact bridge", () => {
  it("maps direct and transitive seed fields while protecting unrelated assets", () => {
    const report = createSeedAssetImpactReport({
      receipt: { adoptionFingerprint: "a".repeat(64), changedFields: ["desire"], recompiledFields: ["desire", "opening"], preservedFields: ["protagonist"] },
      assetMap: { desire: ["contract:desire", "outline:opening"], opening: ["outline:opening", "chapter:1"], protagonist: ["contract:protagonist"] },
      protectedAssetIds: ["contract:protagonist"]
    });
    expect(report.directAssetIds).toEqual(["contract:desire", "outline:opening"]);
    expect(report.transitiveAssetIds).toEqual(["chapter:1"]);
    expect(report.unaffectedAssetIds).toEqual(["contract:protagonist"]);
    expect(report.status).toBe("ready");
  });

  it("blocks when a protected asset is affected", () => {
    const report = createSeedAssetImpactReport({ receipt: { adoptionFingerprint: "b".repeat(64), changedFields: ["desire"], recompiledFields: ["desire"], preservedFields: [] }, assetMap: { desire: ["outline:locked"] }, protectedAssetIds: ["outline:locked"] });
    expect(report.status).toBe("blocked");
    expect(report.blockers).toContain("PROTECTED_ASSET_AFFECTED");
  });

  it("persists and restores the cross-asset report with integrity", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "seed-asset-impact-"));
    const report = createSeedAssetImpactReport({ receipt: { adoptionFingerprint: "c".repeat(64), changedFields: ["desire"], recompiledFields: ["desire"], preservedFields: [] }, assetMap: { desire: ["outline:1"] }, protectedAssetIds: [] });
    await persistSeedAssetImpactReport(root, report);
    await expect(readSeedAssetImpactReport(root, report.reportId)).resolves.toEqual(report);
    await fs.rm(root, { recursive: true, force: true });
  });
});
