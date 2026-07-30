import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import LengthPlanningPanel from "./LengthPlanningPanel.vue";
import type { LengthContract, LengthForecast } from "@/types/novel";

const contract = { schemaVersion: "length-contract.v1", projectSlug: "demo", dimensions: { totalWords: { mode: "soft", min: 100, max: 200 }, totalChapters: { mode: "soft", min: 2, max: 3 }, totalVolumes: { mode: "unknown" }, chapterWords: { mode: "soft", min: 50, max: 100 } }, pauseThresholdRatio: 0.15, hardLocks: [], source: "author", effectiveScope: "project", revisionLineage: [], createdAt: "2026-01-01", fingerprint: "contract" } as LengthContract;
const forecast = { schemaVersion: "length-forecast.v1", projectSlug: "demo", contractFingerprint: "contract", actuals: { totalWords: 250, totalChapters: 2, totalVolumes: 1, chapterWords: [250] }, obligationSummary: { total: 0, open: 0, highImportanceOpen: 0, terminal: 0, sourceFingerprint: "" }, completionRange: { totalWords: { min: 100, max: 200 }, totalChapters: { min: 2, max: 3 }, totalVolumes: { min: 1, max: 1 } }, confidence: "medium", assumptions: [], bestPath: "", worstPath: "", endingReachability: "at-risk", frozenBaseline: "contract", status: "pause-required", blockingReasons: ["soft-range-totalWords"], createdAt: "2026-01-01", fingerprint: "forecast" } as LengthForecast;

describe("LengthPlanningPanel", () => {
  it("shows pause evidence and records an explicit decision", async () => {
    const wrapper = mount(LengthPlanningPanel, { props: { contract, forecast } });
    expect(wrapper.text()).toContain("pause-required");
    await wrapper.get("[data-testid='record-length-variance']").trigger("click");
    expect(wrapper.emitted("decide")).toHaveLength(1);
  });
});
