import { computed, ref } from "vue";

import { defineStore } from "pinia";

import { tagsOf } from "../notes/input";
import type { Note, Tag } from "../notes/types";
import { useNotes } from "../notes/useNotes";

import type { FilterMode, Visibility } from "./types";

/** The tags in use and the tag filter. View state only, never synced. */
export const useTags = defineStore("tags", () => {
  const { notes } = useNotes();

  const tagList = computed(() => {
    const c = new Map<Tag, number>();
    for (const n of notes.value ?? []) for (const t of tagsOf(n)) c.set(t, (c.get(t) ?? 0) + 1);
    return [...c].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
  });

  const selected = ref(new Set<Tag>());
  const mode = ref<FilterMode>("dim");
  const toggleTag = (t: Tag) =>
    selected.value.has(t) ? selected.value.delete(t) : selected.value.add(t);
  const matches = (n: Note) =>
    selected.value.size === 0 || tagsOf(n).some((t) => selected.value.has(t));
  // a text box is the desk's own lettering and a sticker its decoration, not notes to sort: a
  // filter leaves them be
  const visibility = (n: Note): Visibility =>
    n.kind === "text" || n.kind === "sticker" || matches(n)
      ? "shown"
      : mode.value === "dim"
        ? "dimmed"
        : "hidden";

  return { tagList, selected, mode, toggleTag, matches, visibility };
});
