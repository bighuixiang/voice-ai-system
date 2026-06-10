import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { applyInitialTheme, useThemeStore } from "./theme";

describe("theme store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.classList.remove("dark");
    document.documentElement.removeAttribute("style");
  });

  it("defaults to the dark theme", () => {
    applyInitialTheme();

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("persists and applies the light theme", () => {
    const store = useThemeStore();

    store.setTheme("light");

    expect(store.mode).toBe("light");
    expect(store.isDark).toBe(false);
    expect(window.localStorage.getItem("voice-ai-theme")).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});
