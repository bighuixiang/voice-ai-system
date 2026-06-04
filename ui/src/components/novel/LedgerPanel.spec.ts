import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import LedgerPanel from "./LedgerPanel.vue";
import type { LedgerEntry } from "@/types/novel";

const entries: LedgerEntry[] = [
  {
    id: "risk-1",
    kind: "risk",
    title: "POV boundary",
    status: "open",
    severity: "high",
    chapterIds: ["chapter-001"],
    relatedEntities: ["Hero"],
    note: "Avoid knowledge the hero cannot have.",
    updatedAt: "2026-06-04T00:00:00.000Z"
  }
];

const stubs = {
  "el-button": {
    props: ["loading"],
    emits: ["click"],
    template: `<button :data-loading="loading" @click="$emit('click')"><slot /></button>`
  },
  "el-tag": { template: "<span><slot /></span>" }
};

describe("LedgerPanel", () => {
  it("renders active ledger entries and highlights open or high risks", () => {
    const wrapper = mount(LedgerPanel, {
      props: { entries, activeKind: "risk", loading: false },
      global: { stubs }
    });

    expect(wrapper.text()).toContain("POV boundary");
    expect(wrapper.text()).toContain("高优先风险 1 / 1");
    expect(wrapper.find(".ledger-entry").classes()).toContain("priority");
  });

  it("emits ledger kind changes, entry edits, and saves", async () => {
    const wrapper = mount(LedgerPanel, {
      props: { entries, activeKind: "risk", loading: false },
      global: { stubs }
    });

    await wrapper.findAll(".kind-tabs button")[0].trigger("click");
    await wrapper.find("select").setValue("resolved");
    await wrapper.find("textarea").setValue("Fixed by narrowing the scene.");
    await wrapper.find(".panel-title button").trigger("click");

    expect(wrapper.emitted("change-kind")?.[0]).toEqual(["foreshadowing"]);
    expect(wrapper.emitted("update:entries")?.[0][0][0]).toMatchObject({ status: "resolved" });
    expect(wrapper.emitted("update:entries")?.[1][0][0]).toMatchObject({ note: "Fixed by narrowing the scene." });
    expect(wrapper.emitted("save")).toHaveLength(1);
  });
});
