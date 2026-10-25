import { computed, shallowRef } from "vue";

import { defineStore } from "pinia";

import { tagsOf } from "../notes/input";
import type { Note, Tag } from "../notes/types";
import { useNotes } from "../notes/useNotes";
import type { RoomId } from "../rooms/types";
import { useSync } from "../sync/useSync";

import type { FilterMode, Visibility } from "./types";

/** A room's tag filter: the tags picked there, and how its other notes are shown */
interface Filter {
  picked: ReadonlySet<Tag>;
  mode: FilterMode;
}
const UNFILTERED: Filter = { picked: new Set(), mode: "dim" };

/**
 * The tags in use and the tag filter, of the room open now. View state only, never synced.
 * Each room has its own filter: one picked in a room never filters, nor tags new memos in,
 * another.
 */
export const useTags = defineStore("tags", () => {
  const sync = useSync();
  const { notes } = useNotes();

  const tagList = computed(() => {
    const c = new Map<Tag, number>();
    for (const n of notes.value ?? []) for (const t of tagsOf(n)) c.set(t, (c.get(t) ?? 0) + 1);
    return [...c].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
  });

  const filters = shallowRef<ReadonlyMap<RoomId, Filter>>(new Map());
  /** The filter of the room open now; none out of a room */
  const filter = () =>
    sync.room === null ? UNFILTERED : (filters.value.get(sync.room) ?? UNFILTERED);
  function keep(change: Partial<Filter>) {
    const room = sync.room;
    if (room !== null) filters.value = new Map(filters.value).set(room, { ...filter(), ...change });
  }

  /**
   * The tags picked in the room open now that its notes still carry: one whose last note went
   * is no longer picked
   */
  const selected = computed((): ReadonlySet<Tag> => {
    const { picked } = filter();
    return new Set(tagList.value.flatMap((t) => (picked.has(t.name) ? [t.name] : [])));
  });
  const mode = computed({
    get: () => filter().mode,
    set: (next: FilterMode) => keep({ mode: next }),
  });
  function toggleTag(t: Tag) {
    const picked = new Set(selected.value);
    if (!picked.delete(t)) picked.add(t);
    keep({ picked });
  }
  const clearTags = () => keep({ picked: new Set() });
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

  return { tagList, selected, mode, toggleTag, clearTags, matches, visibility };
});
