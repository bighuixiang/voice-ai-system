import { computed, ref } from "vue";
import { defineStore } from "pinia";

export type ThemeMode = "dark" | "light";

const storageKey = "voice-ai-theme";

function normalizeTheme(value: string | null): ThemeMode {
  return value === "light" ? "light" : "dark";
}

export function readStoredTheme(): ThemeMode {
  if (typeof window === "undefined") {
    return "dark";
  }
  return normalizeTheme(window.localStorage.getItem(storageKey));
}

export function applyThemeMode(mode: ThemeMode) {
  if (typeof document === "undefined") {
    return;
  }

  const root = document.documentElement;
  root.dataset.theme = mode;
  root.classList.toggle("dark", mode === "dark");
  root.style.colorScheme = mode;
}

export function applyInitialTheme() {
  applyThemeMode(readStoredTheme());
}

export const useThemeStore = defineStore("theme", () => {
  const mode = ref<ThemeMode>(readStoredTheme());
  const isDark = computed(() => mode.value === "dark");

  function setTheme(nextMode: ThemeMode) {
    mode.value = nextMode;
    if (typeof window !== "undefined") {
      window.localStorage.setItem(storageKey, nextMode);
    }
    applyThemeMode(nextMode);
  }

  function toggleTheme() {
    setTheme(isDark.value ? "light" : "dark");
  }

  applyThemeMode(mode.value);

  return {
    mode,
    isDark,
    setTheme,
    toggleTheme
  };
});
