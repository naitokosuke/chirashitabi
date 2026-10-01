import { computed, ref } from "vue";

import { defineStore } from "pinia";

import { tagsOf } from "../notes/input";
import type { Note } from "../notes/types";
import { useNotes } from "../notes/useNotes";

import type { FilterMode, Visibility } from "./types";

const TAG_COLORS = ["#b11f33", "#a06f00", "#1f6b53", "#2b5bc4", "#7a3fb0", "#b85c1a", "#0f7a8a"];

/** Tag colors and the tag filter. View state only, never synced. */
export const useTags = defineStore("tags", () => {
  const store = useNotes();

  const colorMap = new Map<string, string>();
  function tagColor(t: string) {
    if (!colorMap.has(t)) colorMap.set(t, TAG_COLORS[colorMap.size % TAG_COLORS.length]);
    return colorMap.get(t)!;
  }
  const tagList = computed(() => {
    const c = new Map<string, number>();
    for (const n of store.notes) for (const t of tagsOf(n)) c.set(t, (c.get(t) ?? 0) + 1);
    return [...c]
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count, color: tagColor(name) }));
  });

  const selected = ref(new Set<string>());
  const mode = ref<FilterMode>("dim");
  const toggleTag = (t: string) =>
    selected.value.has(t) ? selected.value.delete(t) : selected.value.add(t);
  const matches = (n: Note) =>
    selected.value.size === 0 || tagsOf(n).some((t) => selected.value.has(t));
  const visibility = (n: Note): Visibility =>
    matches(n) ? "shown" : mode.value === "dim" ? "dimmed" : "hidden";

  return { tagColor, tagList, selected, mode, toggleTag, matches, visibility };
});
