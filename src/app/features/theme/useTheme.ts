import { computed, nextTick, ref, watchEffect } from "vue";

import { defineStore } from "pinia";

import { coverRadius, other, parseTheme, type Theme } from "./theme";

const STORAGE_KEY = "chirashitabi:theme";
/** The desk's color in each theme (tokens.css `--bg`), as the browser's bar takes it */
const BAR: Record<Theme, string> = { light: "#f3f4f6", dark: "#141518" };

/**
 * Runs a state change inside a View Transition: the browser snapshots the page, the change
 * renders, and the two morph into each other (what morphs, and how, is in transitions.css).
 * `types` lets the CSS pick an animation (`:active-view-transition-type(theme-light)`).
 * Without the API, under reduced motion, or with the page hidden (where the browser would
 * abort it), the change simply happens.
 */
function transition(update: () => void, types: readonly string[]) {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (typeof document.startViewTransition !== "function" || reduce || document.hidden) {
    update();
    return;
  }
  const t = document.startViewTransition(async () => {
    update();
    await nextTick();
  });
  // older engines take only the callback form; types are added where they exist
  for (const type of types) t.types?.add(type);
  // a transition skipped by a newer one (a quick second tap) rejects; the update has run anyway
  t.ready.catch(() => {});
  t.finished.catch(() => {});
}

function stored() {
  try {
    return parseTheme(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

/**
 * Light or dark: the device's, until the person picks one here; then theirs, on this device.
 * The pick is the `data-theme` on the root, which `tokens.css` reads through `color-scheme`.
 */
export const useTheme = defineStore("theme", () => {
  const picked = ref<Theme | null>(stored());
  const query = window.matchMedia("(prefers-color-scheme: dark)");
  const deviceDark = ref(query.matches);
  query.addEventListener("change", (e) => (deviceDark.value = e.matches));

  const theme = computed<Theme>(() => picked.value ?? (deviceDark.value ? "dark" : "light"));

  watchEffect(() => {
    const root = document.documentElement;
    if (picked.value === null) delete root.dataset.theme;
    else root.dataset.theme = picked.value;
    // the browser's own bar (a phone's status bar) in the desk's color (index.html)
    for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
      const own: Theme = meta.media.includes("dark") ? "dark" : "light";
      meta.content = BAR[picked.value ?? own];
    }
  });

  function pick(next: Theme) {
    picked.value = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // private mode and the like: it holds until the page is closed
    }
  }

  /**
   * To the other theme. With a point (where the switch was pressed), light spreads out from it
   * over the screen like ink (`theme-light`), and night closes in on it from the edges, the
   * last of the day shrinking into the switch (`theme-dark`; transitions.css). Under reduced
   * motion, without the View Transition API, or with the page hidden, the theme is simply there.
   */
  function toggle(from?: { x: number; y: number }) {
    const next = other(theme.value);
    if (from === undefined) {
      pick(next);
      return;
    }
    const root = document.documentElement;
    root.style.setProperty("--theme-x", `${from.x}px`);
    root.style.setProperty("--theme-y", `${from.y}px`);
    root.style.setProperty(
      "--theme-r",
      `${coverRadius(from.x, from.y, window.innerWidth, window.innerHeight)}px`,
    );
    transition(() => pick(next), ["theme", `theme-${next}`]);
  }

  return { theme, picked, toggle };
});
