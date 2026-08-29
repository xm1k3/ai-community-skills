import { computed, ref, watchEffect } from "vue";

export type ThemeMode = "system" | "light" | "dark";

const STORAGE_KEY = "acs-theme";
const media = window.matchMedia("(prefers-color-scheme: dark)");

function readStored(): ThemeMode {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === "light" || value === "dark" || value === "system") return value;
  } catch {
    return "system";
  }
  return "system";
}

const mode = ref<ThemeMode>(readStored());
const systemDark = ref(media.matches);
media.addEventListener("change", (event) => {
  systemDark.value = event.matches;
});

const isDark = computed(() => mode.value === "dark" || (mode.value === "system" && systemDark.value));

watchEffect(() => {
  document.documentElement.classList.toggle("app-dark", isDark.value);
  try {
    localStorage.setItem(STORAGE_KEY, mode.value);
  } catch {
    return;
  }
});

export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function useTheme() {
  const icon = computed(() => (mode.value === "light" ? "pi pi-sun" : mode.value === "dark" ? "pi pi-moon" : "pi pi-desktop"));
  const label = computed(() => (mode.value === "light" ? "Light" : mode.value === "dark" ? "Dark" : "System"));
  function cycle() {
    mode.value = mode.value === "system" ? "light" : mode.value === "light" ? "dark" : "system";
  }
  return { mode, isDark, icon, label, cycle };
}
