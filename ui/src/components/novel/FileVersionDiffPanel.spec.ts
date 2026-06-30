import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import FileVersionDiffPanel from "./FileVersionDiffPanel.vue";

const version = {
  id: "v1",
  filePath: "chapters/chapter-001.md",
  versionPath: "versions/chapter/v1.md",
  createdAt: "2026-06-12T00:00:00.000Z",
  size: 24
};

describe("FileVersionDiffPanel", () => {
  it("emits refresh, preview, and close events", async () => {
    const wrapper = mount(FileVersionDiffPanel, {
      props: {
        versions: [version],
        diff: {
          filePath: version.filePath,
          fromVersion: version,
          toVersion: { id: "current", label: "当前文件", createdAt: "2026-06-12T00:01:00.000Z" },
          original: "old draft",
          modified: "new draft"
        }
      }
    });

    expect(wrapper.text()).toContain("1 个历史版本");
    expect(wrapper.text()).toContain("old draft");
    expect(wrapper.text()).toContain("new draft");

    await wrapper.find(".version-item").trigger("click");
    await wrapper.findAll("button").find((button) => button.text().includes("刷新"))?.trigger("click");
    await wrapper.findAll("button").find((button) => button.text().includes("关闭对比"))?.trigger("click");

    expect(wrapper.emitted("preview")?.[0]).toEqual(["v1"]);
    expect(wrapper.emitted("refresh")).toHaveLength(1);
    expect(wrapper.emitted("close")).toHaveLength(1);
  });
});
