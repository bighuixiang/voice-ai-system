import { ref, watch, type ComputedRef } from "vue";

interface UseWorkspacePanelStateOptions {
  storageKey: ComputedRef<string>;
  onExpand?: (key: string) => void;
}

export function useWorkspacePanelState(options: UseWorkspacePanelStateOptions) {
  const collapsedPanels = ref<Record<string, boolean>>({});

  function panelCollapsed(key: string, defaultCollapsed = false) {
    return typeof collapsedPanels.value[key] === "boolean" ? collapsedPanels.value[key] : defaultCollapsed;
  }

  function setPanelCollapsed(key: string, collapsed: boolean) {
    collapsedPanels.value = {
      ...collapsedPanels.value,
      [key]: collapsed
    };
    if (!collapsed) {
      options.onExpand?.(key);
    }
  }

  function loadCollapsedPanels() {
    try {
      collapsedPanels.value = JSON.parse(window.localStorage.getItem(options.storageKey.value) || "{}") as Record<string, boolean>;
    } catch {
      collapsedPanels.value = {};
    }
  }

  watch(options.storageKey, loadCollapsedPanels, { immediate: true });

  watch(
    collapsedPanels,
    (value) => {
      window.localStorage.setItem(options.storageKey.value, JSON.stringify(value));
    },
    { deep: true }
  );

  return {
    panelCollapsed,
    setPanelCollapsed
  };
}
