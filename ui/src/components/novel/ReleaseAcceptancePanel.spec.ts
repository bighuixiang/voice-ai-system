import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import ReleaseAcceptancePanel from "./ReleaseAcceptancePanel.vue";
import type { ReleaseAcceptanceDecision } from "@/types/novel";

const decision: ReleaseAcceptanceDecision = { schemaVersion: "release-acceptance.v1", releaseProfile: "RP5-drafting", status: "do-not-activate", checks: [
  { checkId: "migration-cutover", status: "passed", evidence: ["managed-project"], reason: "ok" },
  { checkId: "external-calibration", status: "missing", evidence: [], reason: "No external evidence" },
  { checkId: "governed-e2e", status: "passed", evidence: ["demo"], reason: "ok" },
  { checkId: "v2-independent-review", status: "missing", evidence: [], reason: "No independent review" },
  { checkId: "delivery-proof", status: "missing", evidence: [], reason: "No delivery proof" }
], evaluatedAt: "2026-07-30T00:00:00.000Z", fingerprint: "f" };
const acceptedDecision: ReleaseAcceptanceDecision = { ...decision, status: "accepted", checks: decision.checks.map((check) => ({ ...check, status: "passed" as const })) };

describe("ReleaseAcceptancePanel", () => {
  it("shows every release gate and never implies activation when blocked", () => {
    const wrapper = mount(ReleaseAcceptancePanel, { props: { decision } });
    expect(wrapper.text()).toContain("do-not-activate");
    expect(wrapper.text()).toContain("external-calibration");
    expect(wrapper.text()).toContain("No independent review");
    expect(wrapper.get("[data-testid='release-acceptance-fingerprint']").text()).toContain("f");
    expect(wrapper.text()).toContain("不得激活");
    expect(wrapper.find("button[data-testid='activate-release']").exists()).toBe(false);
  });

  it("refreshes the authoritative decision", async () => {
    const wrapper = mount(ReleaseAcceptancePanel, { props: { loading: true } });
    expect((wrapper.get("button[data-testid='refresh-release-acceptance']").element as HTMLButtonElement).disabled).toBe(true);
    await wrapper.setProps({ loading: false });
    await wrapper.get("button[data-testid='refresh-release-acceptance']").trigger("click");
    expect(wrapper.emitted("refresh")).toHaveLength(1);
  });

  it("offers activation only after authoritative acceptance", async () => {
    const wrapper = mount(ReleaseAcceptancePanel, { props: { decision: acceptedDecision } });
    await wrapper.get("button[data-testid='activate-release']").trigger("click");
    expect(wrapper.emitted("activate")).toHaveLength(1);
    await wrapper.setProps({ activating: true });
    expect((wrapper.get("button[data-testid='activate-release']").element as HTMLButtonElement).disabled).toBe(true);
  });
});
