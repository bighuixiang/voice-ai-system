import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createNarrativeObligation } from "./narrativeObligation.js";
import { buildObligationLoadReport } from "./obligationLoad.js";

describe("obligation load report", () => {
  it("reports weighted window load and preserves open obligations", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "obligation-load-"));
    await createNarrativeObligation(root, { projectSlug: "demo", type: "secret", title: "Secret", questionOrPromise: "Who opened the gate?", importance: "high", sourceRefs: ["chapter://1"] });
    await createNarrativeObligation(root, { projectSlug: "demo", type: "object", title: "Key", questionOrPromise: "Where is the key?", importance: "medium", sourceRefs: ["chapter://2"] });
    const report = await buildObligationLoadReport(root, "demo", ["chapter-001", "chapter-002"]);
    expect(report.openObligationCount).toBe(2);
    expect(report.weightedLoad).toBe(5);
    expect(report.status).toBe("watch");
    expect(report.canClaimNoOpenObligations).toBe(false);
  });

  it("recommends spreading high load and handles empty projects", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "obligation-load-"));
    for (let index = 0; index < 4; index += 1) await createNarrativeObligation(root, { projectSlug: "demo", type: "goal", title: `Goal ${index}`, questionOrPromise: `Open goal ${index}`, importance: "high", sourceRefs: [`chapter://${index}`] });
    const report = await buildObligationLoadReport(root, "demo", ["chapter-001"]);
    expect(report.status).toBe("blocked");
    expect(report.recommendations.some((item) => item.includes("spread"))).toBe(true);
    const empty = await buildObligationLoadReport(root, "other", []);
    expect(empty.openObligationCount).toBe(0);
    expect(empty.status).toBe("stable");
  });
});
