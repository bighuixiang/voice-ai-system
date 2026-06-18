import { computed, nextTick, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import { useWorkspacePanelState } from "./useWorkspacePanelState";

describe("useWorkspacePanelState", () => {
  it("loads persisted state for the active storage key and persists updates", async () => {
    window.localStorage.setItem("workspace:focus", JSON.stringify({ review: true }));

    const mode = ref("focus");
    const onExpand = vi.fn();
    const { panelCollapsed, setPanelCollapsed } = useWorkspacePanelState({
      storageKey: computed(() => `workspace:${mode.value}`),
      onExpand
    });

    await nextTick();

    expect(panelCollapsed("review")).toBe(true);
    expect(panelCollapsed("editor", false)).toBe(false);

    setPanelCollapsed("editor", true);
    await nextTick();

    expect(JSON.parse(window.localStorage.getItem("workspace:focus") || "{}")).toMatchObject({
      review: true,
      editor: true
    });
    expect(onExpand).not.toHaveBeenCalled();

    window.localStorage.setItem("workspace:review", JSON.stringify({ "file-diff": false }));
    mode.value = "review";
    await nextTick();

    expect(panelCollapsed("file-diff", true)).toBe(false);

    setPanelCollapsed("file-diff", false);
    expect(onExpand).toHaveBeenCalledWith("file-diff");
  });
});
