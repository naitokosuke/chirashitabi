import { defineStore } from "pinia";
import { computed, ref, shallowRef } from "vue";
import { Temporal } from "temporal-polyfill-lite";
import {
  COLORS,
  PACKING_TAG,
  TAG_COLORS,
  type Day,
  type Member,
  type Note,
  type NoteInput,
} from "./types";
import { seed } from "./seed";

export const ME: Member = "yuki";
const uid = () => Math.random().toString(36).slice(2, 10);
const now = () => Temporal.Now.instant();
const TRIP_START = Temporal.PlainDate.from("2026-11-03");
const TRIP_DAYS = 4;

/**
 * Transport is the only thing that changes when the Cloudflare room arrives:
 * `send` pushes a mutation, and the room calls `apply` with the authoritative
 * snapshot. Until then it is a local no-op.
 */
export interface Transport {
  send(msg: Mutation): void;
}
export type Mutation =
  | { type: "note:add"; note: Note }
  | { type: "note:update"; id: string; patch: Partial<Note> }
  | { type: "note:move"; id: string; x: number; y: number } // throttled while dragging
  | { type: "note:delete"; id: string }
  | { type: "day:intro"; date: Temporal.PlainDate; intro: string };

export const useNotes = defineStore("notes", () => {
  // Deep ref on purpose: cards read x/y through the array, so moving one card
  // only touches that object. shallowRef would skip those nested updates.
  const notes = ref<Note[]>(seed());
  const transport = shallowRef<Transport>({ send: () => {} });
  const days = ref<Day[]>(
    Array.from({ length: TRIP_DAYS }, (_, i) => ({ date: TRIP_START.add({ days: i }), intro: "" })),
  );

  // ---- tags & filter (view state, never synced) ----
  const tagColorMap = new Map<string, string>();
  function tagColor(t: string) {
    if (!tagColorMap.has(t)) tagColorMap.set(t, TAG_COLORS[tagColorMap.size % TAG_COLORS.length]);
    return tagColorMap.get(t)!;
  }
  const tagList = computed(() => {
    const c = new Map<string, number>();
    for (const n of notes.value) for (const t of n.tags) c.set(t, (c.get(t) ?? 0) + 1);
    return [...c]
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count, color: tagColor(name) }));
  });
  const selected = ref(new Set<string>());
  const mode = ref<"dim" | "only">("dim");
  const toggleTag = (t: string) =>
    selected.value.has(t) ? selected.value.delete(t) : selected.value.add(t);
  const matches = (n: Note) =>
    selected.value.size === 0 || n.tags.some((t) => selected.value.has(t));

  // ---- mutations (local first, then transport) ----
  function add(input: NoteInput, at: { x: number; y: number }): Note {
    const n: Note = {
      id: uid(),
      kind: "note",
      by: ME,
      updatedAt: now(),
      x: at.x + (Math.random() * 20 - 10),
      y: at.y + (Math.random() * 20 - 10),
      rot: Math.random() * 4 - 2,
      ...input,
    };
    notes.value.push(n);
    transport.value.send({ type: "note:add", note: n });
    return n;
  }
  function update(id: string, patch: Partial<Note>) {
    const n = byId(id);
    if (!n) return;
    Object.assign(n, patch, { updatedAt: now() });
    transport.value.send({ type: "note:update", id, patch });
  }
  function move(id: string, x: number, y: number, final = false) {
    const n = byId(id);
    if (!n) return;
    n.x = x;
    n.y = y;
    if (final) n.updatedAt = now();
    transport.value.send({ type: "note:move", id, x, y });
  }
  function remove(id: string) {
    const i = notes.value.findIndex((n) => n.id === id);
    if (i >= 0) notes.value.splice(i, 1);
    transport.value.send({ type: "note:delete", id });
  }
  function duplicate(id: string) {
    const n = byId(id);
    if (!n) return;
    return add(
      { title: n.title, body: n.body, tags: [...n.tags], color: n.color },
      { x: n.x + 24, y: n.y + 24 },
    );
  }
  function adopt(id: string) {
    update(id, { kind: "note", color: "#ffffff", tags: ["Claude"] });
  }
  const byId = (id: string) => notes.value.find((n) => n.id === id);

  // ---- booklet helpers ----
  const unassigned = computed(() =>
    notes.value.filter((n) => n.kind === "note" && !n.date && !n.tags.includes(PACKING_TAG)),
  );
  const onDay = (n: Note, date: Temporal.PlainDate) => n.date?.equals(date) ?? false;
  // untimed items ("Anytime") go last; ties fall back to edit order
  const byTime = (a: Note, b: Note) =>
    (a.time && b.time ? Temporal.PlainTime.compare(a.time, b.time) : +!a.time - +!b.time) ||
    Temporal.Instant.compare(a.updatedAt, b.updatedAt);
  const forDay = (date: Temporal.PlainDate, status?: Note["status"]) =>
    notes.value
      .filter(
        (n) => n.kind === "note" && onDay(n, date) && (!status || (n.status ?? "idea") === status),
      )
      .sort(byTime);
  const byTag = (tag: string) =>
    notes.value.filter((n) => n.kind === "note" && n.tags.includes(tag));
  const budgetOf = (date?: Temporal.PlainDate, onlyFixed = true) =>
    notes.value
      .filter(
        (n) =>
          n.kind === "note" && (!date || onDay(n, date)) && (!onlyFixed || n.status === "fixed"),
      )
      .reduce((s, n) => s + (n.budget ?? 0), 0);
  const dayOf = (date: Temporal.PlainDate) => days.value.find((d) => d.date.equals(date));
  function setIntro(date: Temporal.PlainDate, intro: string) {
    const d = dayOf(date);
    if (d) d.intro = intro;
    transport.value.send({ type: "day:intro", date, intro });
  }

  /** Called by the room when an authoritative snapshot arrives. */
  function apply(snapshot: Note[]) {
    notes.value = snapshot;
  }

  return {
    notes,
    days,
    transport,
    tagList,
    tagColor,
    selected,
    mode,
    toggleTag,
    matches,
    add,
    update,
    move,
    remove,
    duplicate,
    adopt,
    byId,
    apply,
    COLORS,
    unassigned,
    forDay,
    byTag,
    budgetOf,
    dayOf,
    setIntro,
  };
});
