import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import StoryBlueprintPanel from "./StoryBlueprintPanel.vue";

const blueprint = {
  schemaVersion: "story-blueprint.v1" as const,
  blueprintId: "blueprint-1",
  projectSlug: "demo",
  sourceContractCandidateId: "candidate-1",
  sourceFingerprint: "a".repeat(64),
  decisionIds: ["decision-1"],
  content: { storyPremise: "前提", openingImage: "画面", protagonistGoal: "目标", coreConflict: "冲突", failureCost: "代价", worldRules: "规则", readerPromise: "期待", endingDirection: "方向" },
  createdAt: "2026-08-04T00:00:00.000Z",
  fingerprint: "b".repeat(64)
};

describe("StoryBlueprintPanel", () => {
  it("lets the author save a revision or regenerate before confirmation", async () => {
    const wrapper = mount(StoryBlueprintPanel, { props: { blueprint } });
    await wrapper.get("textarea").setValue("修改后的前提");
    await wrapper.get("button").trigger("click");

    expect(wrapper.emitted("revise")?.[0]?.[0]).toMatchObject({ storyPremise: "修改后的前提" });
    expect(wrapper.text()).toContain("重新生成");
    expect(wrapper.text()).toContain("确认蓝图");
  });

  it("offers the next step only after the blueprint is confirmed", async () => {
    const wrapper = mount(StoryBlueprintPanel, { props: { blueprint, confirmed: true } });
    expect(wrapper.text()).toContain("开始制定大纲");
    await wrapper.get(".start-outline").trigger("click");
    expect(wrapper.emitted("start-outline")).toEqual([[]]);
  });

  it("keeps the blueprint area visible with a retry action when loading fails", async () => {
    const wrapper = mount(StoryBlueprintPanel, { props: { blueprint: null, loadError: "故事蓝图暂时无法加载，请重新加载。" } });

    expect(wrapper.get("[role='alert']").text()).toContain("故事蓝图暂时无法加载");
    await wrapper.get("button").trigger("click");
    expect(wrapper.emitted("reload")).toEqual([[]]);
  });

  it("shows a clear loading status while the confirmed blueprint is being fetched", () => {
    const wrapper = mount(StoryBlueprintPanel, { props: { blueprint: null, loading: true } });

    expect(wrapper.get("[role='status']").text()).toContain("正在获取已确认蓝图");
    expect(wrapper.find("button").exists()).toBe(false);
  });

  it("keeps an existing blueprint visible but read-only while it is being refreshed", () => {
    const wrapper = mount(StoryBlueprintPanel, { props: { blueprint, loading: true } });

    expect(wrapper.get("[role='status']").text()).toContain("当前内容暂不可操作");
    expect((wrapper.get("textarea").element as HTMLTextAreaElement).disabled).toBe(true);
    expect((wrapper.get("button").element as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows a reload action when retaining an older blueprint after refresh failure", async () => {
    const wrapper = mount(StoryBlueprintPanel, { props: { blueprint, loadError: "故事蓝图暂时无法加载，已保留当前内容，请重新加载。" } });

    expect(wrapper.get("[role='alert']").text()).toContain("已保留当前内容");
    expect((wrapper.get("textarea").element as HTMLTextAreaElement).disabled).toBe(true);
    await wrapper.get("[role='alert'] button").trigger("click");
    expect(wrapper.emitted("reload")).toEqual([[]]);
  });
});
