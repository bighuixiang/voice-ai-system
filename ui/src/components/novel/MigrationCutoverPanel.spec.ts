import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import MigrationCutoverPanel from "./MigrationCutoverPanel.vue";
import type { MigrationCutoverReport } from "@/types/novel";

const report: MigrationCutoverReport = { schemaVersion: "project-migration-cutover.v1", status: "blocked", projectCount: 2, projects: [
  { projectSlug: "demo", classification: "managed", governanceState: "governed", status: "blocked", blockers: ["migration-cutover-not-activated"] },
  { projectSlug: "legacy", classification: "unmanaged", governanceState: "legacy", status: "blocked", blockers: ["legacy-project"] }
], blockers: ["demo:migration-cutover-not-activated", "legacy:legacy-project"], evaluatedAt: "2026-07-30T00:00:00.000Z", fingerprint: "f" };

describe("MigrationCutoverPanel", () => {
  it("shows project-level migration blockers without activating anything", () => {
    const wrapper = mount(MigrationCutoverPanel, { props: { report } });
    expect(wrapper.text()).toContain("迁移切换");
    expect(wrapper.text()).toContain("demo");
    expect(wrapper.text()).toContain("migration-cutover-not-activated");
    expect(wrapper.get("[data-testid='migration-cutover-fingerprint']").text()).toContain("f");
    expect(wrapper.find("button[data-testid='activate-migration']").exists()).toBe(false);
  });

  it("emits a safe validation refresh", async () => {
    const wrapper = mount(MigrationCutoverPanel, { props: { loading: true } });
    expect((wrapper.get("button[data-testid='validate-migrations']").element as HTMLButtonElement).disabled).toBe(true);
    await wrapper.setProps({ loading: false });
    await wrapper.get("button[data-testid='validate-migrations']").trigger("click");
    expect(wrapper.emitted("validate")).toHaveLength(1);
  });
});
