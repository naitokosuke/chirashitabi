<script lang="ts">
import type { FormTarget } from "./types";

/**
 * Where the form is. The memo tab itself: always a new, unplaced memo, never closed, each save
 * goes to the canvas and leaves it blank; `active` while the tab is up. Or a sheet on a target,
 * over what `back` names (the back control says it), and `onMap` when that is the map, where a
 * memo with a place is a pin.
 */
export type FormMode =
  | { kind: "tab"; active: boolean }
  | { kind: "sheet"; target: FormTarget; back: string; onMap: boolean };
</script>

<script setup lang="ts" vapor>
import { Temporal } from "temporal-polyfill-lite";

import {
  computed,
  nextTick,
  onBeforeMount,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  useId,
  useTemplateRef,
  watch,
} from "vue";

import {
  CtBackButton,
  CtButton,
  CtCheck,
  CtChip,
  CtChipInput,
  CtChoiceList,
  CtField,
  CtFileInput,
  CtHeading,
  CtHint,
  CtInput,
  CtSelect,
  CtSheet,
  CtTextarea,
} from "../../../ui/index";

import { useI18n } from "../../i18n/useI18n";

import backIcon from "../../icons/back.svg";
import closeIcon from "../../icons/close.svg";
import Icon from "../../icons/Icon.vue";
import type { MemberId } from "../members/types";
import { useMembers } from "../members/useMembers";
import {
  googleMapsLink,
  isMapsLink,
  parseHttpUrl,
  isShortMapsLink,
  placeFromUrl,
  placeSearchLink,
} from "../place/google-maps";
import { readHours } from "../place/hours";
import type { FoundPlace } from "../place/types";
import { useOffline } from "../sync/useOffline";
import { useSync } from "../sync/useSync";
import { FITS_AT, fits, likeness, rankTags, type TagOption } from "../tags/rank";
import { useTags } from "../tags/useTags";
import { durationChoices, durationMessage } from "../trip/format";
import type { OverBudget } from "../worker/types";
import { useWorker } from "../worker/useWorker";

import { imageSrc, shrinkImage } from "./image";
import { blankInput, changes, inputFromNote, normalizeTag, noteText, parseNoteText } from "./input";
import { type Booking, type NoteInput, type Tag, TODO_TAG } from "./types";
import { useNotes } from "./useNotes";

const props = defineProps<{ mode: FormMode }>();
const emit = defineEmits<{ close: []; save: [input: NoteInput, keepOpen: boolean] }>();
const store = useNotes();
const { notes } = store;
const tags = useTags();
const i18n = useI18n();
/** Cut off: what needs the Worker is not offered */
const cut = useOffline();
const id = useId();
const docked = computed(() => props.mode.kind === "tab");
const active = computed(() => props.mode.kind === "tab" && props.mode.active);
const onMap = computed(() => props.mode.kind === "sheet" && props.mode.onMap);
const target = computed((): FormTarget =>
  props.mode.kind === "sheet" ? props.mode.target : { kind: "new", pin: null },
);
/** The memo being edited, as it is now; undefined for a new one, or once it is gone */
const editingNote = computed(() => {
  const t = target.value;
  if (t.kind !== "edit") return undefined;
  const n = notes.value?.find((n) => n.id === t.id);
  return n?.kind === "memo" ? n : undefined;
});
const editing = computed(() => target.value.kind === "edit");
// a memo deleted (or turned into something else) while it is open: nothing is left to edit
watch(editingNote, (n) => {
  if (editing.value && n === undefined) emit("close");
});

const startingInput = (): NoteInput => {
  const t = target.value;
  if (t.kind === "edit")
    return editingNote.value === undefined
      ? blankInput([], null)
      : inputFromNote(editingNote.value);
  return blankInput(docked.value ? [] : tags.selected, t.pin);
};
/** What the inputs start from; from here on they are the form's */
const start = startingInput();
const form = ref<NoteInput>(start);
const mapsUrl = ref(start.mapsUrl ?? "");
/** When the place is open, as written (OpenStreetMap's way); blank for not said */
const hours = ref(start.hours ?? "");
// ---- whether it has to be booked: none, still to book (by a day), or booked (its number and page) ----
type BookingState = "none" | Booking["state"];
const startBooking = start.booking;
const bookingState = ref<BookingState>(startBooking?.state ?? "none");
const bookingBy = ref(startBooking?.state === "needed" ? (startBooking.by?.toString() ?? "") : "");
const bookingCode = ref(startBooking?.state === "booked" ? startBooking.code : "");
const bookingUrl = ref(startBooking?.state === "booked" ? (startBooking.url ?? "") : "");
function setBookingState(next: string) {
  if (next === "none" || next === "needed" || next === "booked") bookingState.value = next;
}
/** The booking as the fields say it; a page that is no http(s) link is none */
function bookingOf(): Booking | null {
  if (bookingState.value === "none") return null;
  if (bookingState.value === "needed")
    return {
      state: "needed",
      by: bookingBy.value === "" ? null : Temporal.PlainDate.from(bookingBy.value),
    };
  return {
    state: "booked",
    code: bookingCode.value.trim(),
    url: parseHttpUrl(bookingUrl.value.trim()),
  };
}
function clearBooking() {
  bookingState.value = "none";
  bookingBy.value = "";
  bookingCode.value = "";
  bookingUrl.value = "";
}
// ---- a to-do: the day it is to be done by, and who is to do it (or to book it) ----
const { members } = useMembers();
const people = computed(() => (members.value ?? []).filter((m) => m.kind === "person"));
const isTodo = computed(() => form.value.tags.includes(TODO_TAG));
/** Someone is to do it: a to-do, or a plan still to book */
const hasAssignee = computed(() => isTodo.value || bookingState.value === "needed");
const due = ref(form.value.due?.toString() ?? "");
const assignee = ref<string>(form.value.assignee ?? "");
/** Whom the field names, while they are in the room */
const assigneeOf = (): MemberId | null =>
  people.value.find((m) => m.id === assignee.value)?.id ?? null;
/** Written, but past what the booklet can read: it is kept as it is and checks nothing */
const hoursUnread = computed(() => hours.value.trim() !== "" && readHours(hours.value) === null);
/** A short link is on its way to the Worker to be read */
const expanding = ref(false);
/** The short link last sent to be read: a paste reads it at once, and leaving the field after is the same one */
let expandedFrom = "";
async function onMapsUrl() {
  Object.assign(form.value, placeFromUrl(mapsUrl.value, form.value.pin));
  const short = mapsUrl.value.trim();
  const api = worker.api;
  if (api === null || cut.offline || !isShortMapsLink(short) || short === expandedFrom) return;
  expandedFrom = short;
  // a shared short link hides its point: the Worker reads where it leads, and the link becomes
  // that one, unless something else was pasted meanwhile
  expanding.value = true;
  try {
    const answer = await api.expandLink(short, i18n.locale);
    // past the budget the short link stays, as when it could not be read; a link pasted
    // meanwhile is the newer one's
    if (!answer.ok || mapsUrl.value.trim() !== short) return;
    const { url, at } = answer.value;
    if (url === short) return;
    mapsUrl.value = url;
    Object.assign(form.value, placeFromUrl(url, at ?? form.value.pin));
  } catch {
    // the short link stays; the form says it has no point yet
  } finally {
    // a short link sent meanwhile is still on its way: it says when it is done
    if (expandedFrom === short) expanding.value = false;
  }
}
/** A paste is read at once, once the field holds it, without waiting for the field to be left */
const onMapsPaste = () => setTimeout(onMapsUrl);

// ---- where the idea came from: a page, read by the Worker for its title, line and picture ----
const link = ref(form.value.link ?? "");
/** What reading the page is doing, or what it found: the site, or why nothing */
type LinkState =
  | { kind: "idle" }
  | { kind: "fetching" }
  | { kind: "found"; site: string }
  | { kind: "none" | "failed" | "place" | OverBudget["ceiling"] };
const linkState = shallowRef<LinkState>({ kind: "idle" });
const LINK_STATE = {
  fetching: "form.linkFetching",
  none: "form.linkNone",
  failed: "form.linkFailed",
  place: "form.linkIsPlace",
  day: "form.tagsLimit",
  trip: "form.tagsTripLimit",
} as const satisfies Record<Exclude<LinkState["kind"], "idle" | "found">, string>;
/** The link last read: leaving the field after a paste is the same one */
let previewedFrom = "";
/**
 * The page behind the link, once: its title and line fill words not written yet, its picture
 * a card with none. A Google Maps link is the place's, not a page to read
 */
async function onLink() {
  const raw = link.value.trim();
  const url = parseHttpUrl(raw);
  if (url === null || url === previewedFrom) return;
  if (isMapsLink(url)) {
    linkState.value = { kind: "place" };
    return;
  }
  const api = worker.api;
  if (api === null || cut.offline) return;
  previewedFrom = url;
  linkState.value = { kind: "fetching" };
  const answer = await api.preview(url).catch(() => null);
  // what came back, a failure too, is about this link only: one written meanwhile is the newer one's
  if (link.value.trim() !== raw) return;
  if (answer === null) {
    linkState.value = { kind: "failed" };
    return;
  }
  if (!answer.ok) {
    linkState.value = { kind: answer.reason.ceiling };
    return;
  }
  const found = answer.value;
  if (found === null) {
    linkState.value = { kind: "none" };
    return;
  }
  // the page's own link is the one read too: leaving the field after is no new link
  link.value = found.url;
  previewedFrom = found.url;
  if (text.value.trim() === "")
    text.value = [found.title, found.description].filter((s) => s !== null).join("\n");
  if (form.value.image === null && found.image !== null) form.value.image = found.image;
  linkState.value = { kind: "found", site: found.site };
}
const onLinkPaste = () => setTimeout(onLink);
const hasPin = () => form.value.pin !== null;
const text = ref(noteText(form.value));
const tagInput = ref("");
const keepOpen = ref(false);

// ---- a picture on the card: shrunk on the device, kept by the room, then named by its id ----
const worker = useWorker();
const sync = useSync();
type PhotoState = "idle" | "sending" | "failed" | "full";
const photo = ref<PhotoState>("idle");
const PHOTO_STATE = {
  sending: "form.photoSending",
  failed: "form.photoFailed",
  full: "form.photoFull",
} as const satisfies Record<Exclude<PhotoState, "idle">, string>;
const photoSrc = computed(() =>
  form.value.image === null || sync.room === null ? null : imageSrc(sync.room, form.value.image),
);
async function onPhoto(e: Event) {
  const input = e.target;
  if (!(input instanceof HTMLInputElement)) return;
  const file = input.files?.[0];
  input.value = ""; // the same photo can be picked again after a failure
  const api = worker.api;
  if (file === undefined || api === null) return;
  photo.value = "sending";
  try {
    const kept = await api.uploadImage(await shrinkImage(file));
    if (kept.ok) form.value.image = kept.value;
    photo.value = kept.ok ? "idle" : "full";
  } catch {
    photo.value = "failed";
  }
}
function removePhoto() {
  form.value.image = null;
}

// ---- tags Clef finds fitting: asked by itself once the words settle, or with a tap at first ----
type TagState = "idle" | "asking" | "none" | "failed" | OverBudget["ceiling"];
const tagState = ref<TagState>("idle");
const TAG_STATE = {
  asking: "form.tagsAsking",
  none: "form.tagsNone",
  failed: "form.tagsFailed",
  day: "form.tagsLimit",
  trip: "form.tagsTripLimit",
} as const satisfies Record<Exclude<TagState, "idle">, string>;
const offered = ref<{ tag: Tag; p: number; isNew: boolean }[]>([]);
/**
 * In a room with no tags yet, the first ask has the agent propose the trip's tags too, so it
 * waits for a tap; after that Clef is asked by itself
 */
const askByTap = computed(() => tags.tagList.length === 0);
/** Each ask is one of the person's budgeted calls: Clef asks by itself at most this often a memo */
const MAX_ASKS = 2;
/** How long the words stay still before Clef is asked */
const SETTLE_MS = 1500;
/** Words less alike than this to those last asked about are a new memo to Clef (tags/rank.ts) */
const ASKED_ALIKE = 0.6;
/** What Clef was last asked about for this memo, and how many times */
let asked: { words: string; image: NoteInput["image"] } | null = null;
let asks = 0;
/** Counts the memos written here: an answer about one already saved is dropped */
let memo = 0;
async function askForTags(byTap: boolean) {
  const api = worker.api;
  if (api === null || tagState.value === "asking") return;
  const { title, body, tags: inline } = parseNoteText(text.value);
  const of = memo;
  asked = { words: `${title}\n${body}`, image: form.value.image };
  asks++;
  tagState.value = "asking";
  try {
    const got = await api.suggestTags({
      title,
      body,
      image: form.value.image,
      chosen: [...form.value.tags, ...inline],
    });
    if (of !== memo) return;
    if (!got.ok) {
      // past the budget: Clef stops asking by itself for this memo
      asks = MAX_ASKS;
      tagState.value = got.reason.ceiling;
      return;
    }
    offered.value = got.value;
    // nothing fitting is worth saying only to the one who asked
    tagState.value = byTap && !got.value.some((t) => t.p >= FITS_AT) ? "none" : "idle";
  } catch {
    if (of !== memo) return;
    // failed: Clef stops asking by itself for this memo
    asks = MAX_ASKS;
    tagState.value = "failed";
  }
}
/** Asked once the words are there, then again only for a new photo or words much changed */
function worthAsking() {
  if (askByTap.value || asks >= MAX_ASKS || text.value.trim() === "") return false;
  if (asked === null) return true;
  const { title, body } = parseNoteText(text.value);
  return (
    form.value.image !== asked.image || likeness(`${title}\n${body}`, asked.words) < ASKED_ALIKE
  );
}
let settle: ReturnType<typeof setTimeout> | undefined;
watch([text, () => form.value.image], () => {
  clearTimeout(settle);
  // the words all taken back: what comes next is another memo, with its own asks
  if (text.value.trim() === "" && asked !== null) forgetTags();
  settle = setTimeout(() => {
    if (worthAsking()) void askForTags(false);
  }, SETTLE_MS);
});
onBeforeUnmount(() => clearTimeout(settle));
/** What Clef made of the last memo says nothing of the next */
function forgetTags() {
  memo++;
  asked = null;
  asks = 0;
  offered.value = [];
  tagState.value = "idle";
}
// ---- the tags to add: those in use and the trip's, in the order they fit the words as typed ----
/** The trip's candidate tags the agent proposed; read once the Worker is there, free */
const candidates = ref<Tag[]>([]);
watch(
  () => worker.api,
  async (api, _, onCleanup) => {
    if (api === null) return;
    // another room's Worker (or none) meanwhile: what this one answers is no longer the trip's
    let stale = false;
    onCleanup(() => (stale = true));
    const c = await api.tagCandidates().catch(() => null);
    // without them the tags in use still rank; Clef's answers bring the candidates too
    if (!stale && c !== null) candidates.value = c;
  },
  { immediate: true },
);
/** As many as a glance takes in */
const MAX_SHOWN = 8;
/** Not on the memo yet, neither added nor written as a #tag: one added from them goes */
const options = computed((): TagOption[] => {
  const judged = new Map(offered.value.map((o) => [o.tag, o.p]));
  const inUse = tags.tagList.map(({ name, count }) => ({
    name,
    count,
    p: judged.get(name) ?? null,
    isNew: false,
  }));
  const known = new Set(inUse.map((t) => t.name));
  // the trip's candidates, and any Clef judged that came after them: no note has them yet
  const fresh = [...new Set([...candidates.value, ...offered.value.map((o) => o.tag)])]
    .filter((t) => !known.has(t))
    .map((name) => ({ name, count: 0, p: judged.get(name) ?? null, isNew: true }));
  const on = new Set([...form.value.tags, ...parseNoteText(text.value).tags]);
  return [...inUse, ...fresh].filter((o) => !on.has(o.name));
});
const ranked = computed(() => rankTags(options.value, text.value).slice(0, MAX_SHOWN));
/**
 * What the row shows: the ranking, taken at most every so often so the chips slide to their
 * places instead of shuffling under the fingers on every keystroke
 */
const shown = ref(ranked.value);
const RESORT_MS = 300;
const rowEl = useTemplateRef<HTMLElement>("rowEl");
/**
 * Moves the row's chips to their new places instead of jumping (FLIP): where each one is gets
 * noted, the change renders, and each slides from its old place to its new one; a new one
 * fades in. They are the children of `row` carrying `data-flip`, matched by its value. Unlike
 * a View Transition, the page stays live meanwhile, so it can run while someone types. Under
 * reduced motion the change simply happens.
 */
function flip(row: HTMLElement | null, update: () => void) {
  // rendering on a server there is nothing to move: the change simply happens
  if (import.meta.env.SSR) {
    update();
    return;
  }
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (row === null || reduce || typeof Element.prototype.animate !== "function") {
    update();
    return;
  }
  const items = () => [...row.querySelectorAll<HTMLElement>(":scope > [data-flip]")];
  const before = new Map(items().map((el) => [el.dataset.flip, el.getBoundingClientRect()]));
  update();
  void nextTick(() => {
    const timing = { duration: 280, easing: "cubic-bezier(0.22, 1, 0.36, 1)" };
    for (const el of items()) {
      const was = before.get(el.dataset.flip);
      if (was === undefined) {
        el.animate({ opacity: [0, 1], scale: [0.9, 1] }, timing);
        continue;
      }
      const now = el.getBoundingClientRect();
      const dx = was.left - now.left;
      const dy = was.top - now.top;
      if (dx === 0 && dy === 0) continue;
      el.animate({ translate: [`${dx}px ${dy}px`, "0 0"] }, timing);
    }
  });
}
let resorted = 0;
let resort: ReturnType<typeof setTimeout> | undefined;
function showRanked() {
  resort = undefined;
  resorted = Date.now();
  flip(rowEl.value, () => (shown.value = ranked.value));
}
watch(ranked, () => {
  if (resort !== undefined) return;
  const wait = resorted + RESORT_MS - Date.now();
  if (wait <= 0) showRanked();
  else resort = setTimeout(showRanked, wait);
});
onBeforeUnmount(() => clearTimeout(resort));

// ---- where the memo is: the agent names the place, OpenStreetMap finds it; one is chosen ----
/** The places found to choose from, or what the ask is doing or why it found none */
type Places =
  | { kind: "idle"; found: FoundPlace[] }
  | { kind: "asking" | "none" | "failed" | OverBudget["ceiling"] };
const places = shallowRef<Places>({ kind: "idle", found: [] });
const PLACE_STATE = {
  asking: "form.placesAsking",
  none: "form.placesNone",
  failed: "form.placesFailed",
  day: "form.tagsLimit",
  trip: "form.tagsTripLimit",
} as const satisfies Record<Exclude<Places["kind"], "idle">, string>;
/** What there is to choose from: only once an ask found some */
const found = computed(() => (places.value.kind === "idle" ? places.value.found : []));
async function findPlaces() {
  const api = worker.api;
  if (api === null || places.value.kind === "asking") return;
  const { title, body, tags: inline } = parseNoteText(text.value);
  places.value = { kind: "asking" };
  try {
    const answer = await api.findPlaces({
      title,
      body,
      tags: [...form.value.tags, ...inline],
      lang: i18n.locale,
    });
    if (!answer.ok) places.value = { kind: answer.reason.ceiling };
    else if (answer.value.length === 0) places.value = { kind: "none" };
    else places.value = { kind: "idle", found: answer.value };
  } catch {
    places.value = { kind: "failed" };
  }
}
/**
 * The chosen place becomes the memo's link, and its point the pin, as a pasted link would; its
 * opening hours, when OpenStreetMap knows them, become the memo's, for the booklet to check
 */
function choosePlace(p: FoundPlace) {
  mapsUrl.value = placeSearchLink(p.name, p.at);
  void onMapsUrl();
  if (p.hours !== null) hours.value = p.hours;
  places.value = { kind: "idle", found: [] };
}

/**
 * A memo started at a point pinned on the map gets that point's link at once; then OpenStreetMap
 * says what is there, and the link names it and an empty title takes its name. Nothing the
 * person has typed or pasted meanwhile is overwritten.
 */
const naming = ref(false);
/** The title and link came from OpenStreetMap: its credit is shown, as its licence asks */
const namedByOsm = ref(false);
async function nameThePin() {
  const at = form.value.pin;
  if (editing.value || at === null) return;
  mapsUrl.value = googleMapsLink(at);
  void onMapsUrl();
  const auto = mapsUrl.value;
  const api = worker.api;
  if (api === null) return;
  naming.value = true;
  // the link to the point is there already; a name is a nicety
  const place = await api.whereIs(at, i18n.locale).catch(() => null);
  naming.value = false;
  if (place === null) return;
  if (mapsUrl.value === auto) {
    mapsUrl.value = placeSearchLink(place.name, at);
    void onMapsUrl();
  }
  if (text.value.trim() === "") text.value = place.name;
  if (place.hours !== null && hours.value.trim() === "") hours.value = place.hours;
  namedByOsm.value = true;
}
void nameThePin();

const textEl = useTemplateRef<{ focus(): void }>("textEl");
const focusText = () => void nextTick(() => textEl.value?.focus());
onMounted(() => {
  if (!docked.value || active.value) focusText();
});
// the memo tab is ready to type into whenever it comes up
watch(active, (up) => {
  if (up) focusText();
});

// Esc closes the sheet, the way it closes anything that covers something
function onKey(e: KeyboardEvent) {
  if (e.key === "Escape") emit("close");
}
// Focus goes back where it came from once the sheet is gone and the layer under it is live again
let opener: HTMLElement | null = null;
onBeforeMount(() => {
  if (document.activeElement instanceof HTMLElement) opener = document.activeElement;
});
onMounted(() => {
  if (!docked.value) window.addEventListener("keydown", onKey);
});
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKey);
  const back = opener;
  if (!docked.value && back !== null && back !== document.body)
    setTimeout(() => back.isConnected && back.focus());
});

/** From the map with a place: the note is a pin there (and a card on the desk) */
const atPlace = computed(() => onMap.value && hasPin());
/** From the map's stamp with no place yet: it still lands on the canvas, so say so instead of "save to canvas" from a map */
const noPlace = computed(() => onMap.value && !hasPin());
const saveLabel = computed(() =>
  editing.value
    ? "form.save"
    : atPlace.value
      ? "form.saveHere"
      : noPlace.value
        ? "form.saveNoPlace"
        : "form.saveToCanvas",
);
const hintKey = computed(() =>
  docked.value
    ? "form.hintDocked"
    : atPlace.value
      ? "form.hintHere"
      : noPlace.value
        ? "form.hintNoPlace"
        : "form.hint",
);

function addTag(raw: string) {
  const t = normalizeTag(raw);
  if (t !== null && !form.value.tags.includes(t)) form.value.tags.push(t);
}
function commitTag() {
  if (tagInput.value.trim() !== "") {
    addTag(tagInput.value);
    tagInput.value = "";
  }
}
function removeTag(t: Tag) {
  form.value.tags.splice(form.value.tags.indexOf(t), 1);
}
/** How long it takes there; the booklet says when it ends from it */
function setMinutes(value: string) {
  form.value.minutes = value === "" ? null : Number(value);
}
/** "1 h 30 min" */
function long(minutes: number) {
  const d = durationMessage(minutes);
  return i18n.t(d.id, d.params);
}

/** The memo as the fields say it */
function fieldsInput(): NoteInput {
  const { title, body, tags: inline } = parseNoteText(text.value);
  return {
    title,
    body,
    tags: [...new Set([...form.value.tags, ...inline])],
    color: form.value.color,
    mapsUrl: form.value.mapsUrl,
    pin: form.value.pin,
    image: form.value.image,
    minutes: form.value.minutes,
    hours: hours.value.trim() === "" ? null : hours.value.trim(),
    link: parseHttpUrl(link.value.trim()),
    booking: bookingOf(),
    // a day and someone only while it is a to-do (or, for someone, still to book)
    due: isTodo.value && due.value !== "" ? Temporal.PlainDate.from(due.value) : null,
    assignee: hasAssignee.value ? assigneeOf() : null,
  };
}
/** What the fields said when the form opened: an edit sends only what was changed from it */
const opened = fieldsInput();

function submit() {
  commitTag();
  void onMapsUrl();
  const input = fieldsInput();
  if (target.value.kind === "edit") {
    // the fields the person left as they were stay the room's: the partner may have changed them meanwhile
    const patch = changes(opened, input);
    if (Object.keys(patch).length > 0) store.update(target.value.id, patch);
    emit("close");
    return;
  }
  // the memo tab is never closed; a sheet stays open only to add another
  const again = docked.value || keepOpen.value;
  emit("save", input, again);
  if (!again) return;
  // a fresh sheet for the next one; from a point on the map, at that point again
  form.value = startingInput();
  mapsUrl.value = "";
  hours.value = "";
  link.value = "";
  linkState.value = { kind: "idle" };
  previewedFrom = "";
  clearBooking();
  due.value = "";
  assignee.value = "";
  text.value = "";
  namedByOsm.value = false;
  forgetTags();
  void nameThePin();
  focusText();
}
</script>

<template>
  <CtSheet as="form" class="note-form" :docked @submit="submit">
    <!-- no bar: as a sheet, the way back floats where a bar would be; the title opens the page -->
    <template v-if="mode.kind === 'sheet'" #top>
      <CtBackButton @click="() => emit('close')">
        <Icon :size="16" :src="backIcon" />{{ mode.back }}
      </CtBackButton>
    </template>
    <template #default>
      <div class="fields">
        <!-- as a sheet, a sheet's title; as the memo tab, a page like home, its large title -->
        <CtHeading class="title" :level="docked ? 'page' : 'sheet'">{{
          i18n.t(editing ? "form.titleEdit" : "form.titleNew")
        }}</CtHeading>
        <!-- on a computer, side by side: what the note is, then the details of the plan -->
        <div class="what">
          <CtField :for="`${id}-text`" :label="i18n.t('form.note')">
            <CtTextarea
              :id="`${id}-text`"
              ref="textEl"
              v-model="text"
              rows="4"
              size="lg"
              :placeholder="i18n.t('form.notePlaceholder')"
            />
          </CtField>
          <CtField :for="`${id}-tag`" :label="i18n.t('form.tags')">
            <CtChipInput
              :id="`${id}-tag`"
              v-model="tagInput"
              :placeholder="i18n.t('form.tagPlaceholder')"
              @commit="commitTag"
            >
              <CtChip
                v-for="t in form.tags"
                :key="t"
                selected
                size="sm"
                @click="() => removeTag(t)"
              >#{{ t }} <Icon :size="12" :src="closeIcon" /></CtChip>
            </CtChipInput>
            <!-- the tags that fit the words go first; what Clef offered is among them, a new one marked -->
            <div ref="rowEl" class="recent">
              <CtChip
                v-for="o in shown"
                :key="o.name"
                :data-flip="o.name"
                :aside="o.isNew ? i18n.t('form.newTag') : undefined"
                :dashed="o.isNew"
                :suggested="fits(o, text)"
                @click="() => addTag(o.name)"
              >#{{ o.name }}</CtChip>
            </div>
            <!-- Clef looks at the words and the photo; what it finds fitting moves up the row -->
            <div v-if="worker.api !== null && (askByTap || tagState !== 'idle')" class="suggested">
              <CtButton
                v-if="askByTap"
                variant="ask"
                :disabled="tagState === 'asking' || !text.trim() || cut.offline"
                :busy="tagState === 'asking'"
                @click="() => askForTags(true)"
              >{{ i18n.t("form.suggestTags") }}</CtButton>
              <CtHint v-if="tagState !== 'idle'" aria-live="polite">{{
                i18n.t(TAG_STATE[tagState])
              }}</CtHint>
              <CtHint v-else-if="askByTap && cut.offline">{{
                i18n.t("offline.unavailable")
              }}</CtHint>
            </div>
          </CtField>
          <CtField :for="`${id}-link`" :label="i18n.t('form.link')">
            <CtInput
              :id="`${id}-link`"
              v-model="link"
              inputmode="url"
              type="url"
              :placeholder="i18n.t('form.linkPlaceholder')"
              @change="onLink"
              @paste="onLinkPaste"
            />
            <CtHint v-if="linkState.kind === 'found'" aria-live="polite">{{
              i18n.t("form.linkFound", { site: linkState.site })
            }}</CtHint>
            <CtHint v-else-if="linkState.kind !== 'idle'" aria-live="polite">{{
              i18n.t(LINK_STATE[linkState.kind])
            }}</CtHint>
            <CtHint v-else-if="cut.offline">{{ i18n.t("offline.unavailable") }}</CtHint>
          </CtField>
          <!-- a phone: the last field, as it was -->
          <CtField
            v-if="worker.api !== null"
            class="photo"
            :for="`${id}-photo`"
            :label="i18n.t('form.photo')"
          >
            <figure v-if="photoSrc !== null">
              <img alt="" :src="photoSrc" />
              <CtChip float @click="removePhoto">{{ i18n.t("form.removePhoto") }}</CtChip>
            </figure>
            <CtFileInput
              :id="`${id}-photo`"
              accept="image/*"
              :disabled="photo === 'sending' || cut.offline"
              @change="onPhoto"
            />
            <CtHint v-if="photo !== 'idle'" aria-live="polite">{{
              i18n.t(PHOTO_STATE[photo])
            }}</CtHint>
            <CtHint v-else-if="cut.offline">{{ i18n.t("offline.unavailable") }}</CtHint>
          </CtField>
        </div>
        <div class="details">
          <CtField :for="`${id}-maps`" :label="i18n.t('form.place')">
            <CtInput
              :id="`${id}-maps`"
              v-model="mapsUrl"
              inputmode="url"
              type="url"
              :placeholder="i18n.t('form.mapsPlaceholder')"
              @change="onMapsUrl"
              @paste="onMapsPaste"
            />
            <CtHint aria-live="polite">{{
              i18n.t(
                naming
                  ? "form.placeNaming"
                  : expanding
                    ? "form.placeExpanding"
                    : hasPin()
                      ? "form.pinned"
                      : mapsUrl.trim()
                        ? worker.api
                          ? "form.urlNoPinFind"
                          : "form.urlNoPin"
                        : worker.api
                          ? "form.unpinnedFind"
                          : "form.unpinned",
              )
            }}</CtHint>
            <!-- or found from the memo's words: the agent names it, OpenStreetMap places it, one is chosen -->
            <div v-if="worker.api !== null" class="places">
              <CtButton
                variant="ask"
                :disabled="places.kind === 'asking' || !text.trim() || cut.offline"
                :busy="places.kind === 'asking'"
                @click="findPlaces"
              >{{ i18n.t("form.findPlace") }}</CtButton>
              <CtChoiceList
                v-if="found.length > 0"
                dashed
                :items="
                  found.map((p) => ({
                    key: `${p.at.lat},${p.at.lng}`,
                    label: p.name,
                    detail: p.address,
                    place: p,
                  }))
                "
                @choose="(it) => choosePlace(it.place)"
              />
              <CtHint v-if="found.length > 0 || namedByOsm">{{
                i18n.t("form.placesCredit")
              }}</CtHint>
              <CtHint v-if="places.kind !== 'idle'" aria-live="polite">{{
                i18n.t(PLACE_STATE[places.kind])
              }}</CtHint>
              <CtHint v-else-if="cut.offline">{{ i18n.t("offline.unavailable") }}</CtHint>
            </div>
          </CtField>
          <CtField :for="`${id}-hours`" :label="i18n.t('form.hours')">
            <CtInput
              :id="`${id}-hours`"
              v-model="hours"
              autocapitalize="off"
              spellcheck="false"
              :placeholder="i18n.t('form.hoursPlaceholder')"
            />
            <CtHint aria-live="polite">{{
              i18n.t(hoursUnread ? "form.hoursUnread" : "form.hoursHint")
            }}</CtHint>
          </CtField>
          <CtField :for="`${id}-booking`" :label="i18n.t('form.booking')">
            <CtSelect
              :id="`${id}-booking`"
              :model-value="bookingState"
              @update:model-value="setBookingState"
            >
              <option value="none">{{ i18n.t("form.bookingNone") }}</option>
              <option value="needed">{{ i18n.t("form.bookingNeeded") }}</option>
              <option value="booked">{{ i18n.t("form.bookingBooked") }}</option>
            </CtSelect>
          </CtField>
          <CtField v-if="isTodo" :for="`${id}-due`" :label="i18n.t('form.due')">
            <CtInput :id="`${id}-due`" v-model="due" type="date" />
          </CtField>
          <CtField v-if="hasAssignee" :for="`${id}-assignee`" :label="i18n.t('form.assignee')">
            <CtSelect :id="`${id}-assignee`" v-model="assignee">
              <option value="">{{ i18n.t("form.assigneeAnyone") }}</option>
              <option v-for="m in people" :key="m.id" :value="m.id">{{ m.name }}</option>
            </CtSelect>
          </CtField>
          <CtField
            v-if="bookingState === 'needed'"
            :for="`${id}-booking-by`"
            :label="i18n.t('form.bookingBy')"
          >
            <CtInput :id="`${id}-booking-by`" v-model="bookingBy" type="date" />
          </CtField>
          <template v-else-if="bookingState === 'booked'">
            <CtField :for="`${id}-booking-code`" :label="i18n.t('form.bookingCode')">
              <CtInput
                :id="`${id}-booking-code`"
                v-model="bookingCode"
                autocapitalize="characters"
                maxlength="100"
                spellcheck="false"
              />
            </CtField>
            <CtField :for="`${id}-booking-url`" :label="i18n.t('form.bookingUrl')">
              <CtInput
                :id="`${id}-booking-url`"
                v-model="bookingUrl"
                inputmode="url"
                type="url"
                :placeholder="i18n.t('form.bookingUrlPlaceholder')"
              />
            </CtField>
          </template>
          <CtField :for="`${id}-minutes`" :label="i18n.t('shiori.minutes')">
            <CtSelect
              :id="`${id}-minutes`"
              :model-value="String(form.minutes ?? '')"
              @update:model-value="setMinutes"
            >
              <option value="">{{ i18n.t("form.minutesUnset") }}</option>
              <option v-for="m in durationChoices(form.minutes)" :key="m" :value="String(m)">{{
                long(m)
              }}</option>
            </CtSelect>
          </CtField>
        </div>
      </div>
    </template>
    <template #foot>
      <div class="act">
        <CtCheck
          v-if="!docked && !editing"
          :id="`${id}-again`"
          v-model="keepOpen"
          class="again"
          quiet
        >{{
          i18n.t("form.addAnother")
        }}</CtCheck>
        <CtButton
          size="lg"
          type="submit"
          variant="primary"
          :disabled="!text.trim() || photo === 'sending'"
        >{{
          i18n.t(saveLabel)
        }}</CtButton>
        <CtHint v-if="!editing">{{ i18n.t(hintKey) }}</CtHint>
      </div>
    </template>
  </CtSheet>
</template>

<style scoped>
@import "/src/ui/styles/media.css";

/* a sheet (CtSheet), or docked as the memo tab; on a computer, all of it along 1100px of columns */
.note-form {
  @media (--desktop) {
    --sheet-inline: max(32px, (100% - 1100px) / 2);
  }

  .fields {
    display: flex;
    flex-direction: column;
    gap: 16px;

    /* a phone: one column of fields, the photo last */
    > .what,
    > .details {
      display: contents;
    }

    .photo {
      order: 1;
    }

    /*
     * A computer: two columns as wide as 1100px, what the note is (its words, tags, page and
     * photo) on the start, the details of the plan on the end, each a column of its own fields
     */
    @media (--desktop) {
      display: grid;
      grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
      align-content: start;
      align-items: start;
      gap: 24px 48px;

      > .title {
        grid-column: 1 / -1;
      }

      > .what,
      > .details {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
    }

    /* each field (CtField) puts 6px between what it holds; the margins below are what goes past it */
    > :is(.what, .details) > div {
      > textarea {
        /* room to write, which a phone could not give */
        @media (--desktop) {
          min-height: 240px;
        }
      }

      > .recent {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 2px;
      }

      /* the ask for the place, then the places to choose */
      > .places {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 8px;
        margin-top: 2px;

        /* the places to choose, as wide as the field */
        > ul {
          align-self: stretch;
        }
      }

      /* the ask for tags, then what came back */
      > .suggested {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px;
        margin-top: 2px;

        > p {
          flex-basis: 100%;
        }
      }

      /* the card's picture, as it will show, with a way to take it off */
      > figure {
        position: relative;
        margin: 0 0 2px;

        > img {
          display: block;
          width: 100%;
          max-height: 240px;
          object-fit: cover;
          border-radius: 10px;
          background: var(--wash);
        }

        /* taking it off: a chip floating on the picture's corner */
        > button {
          position: absolute;
          inset-block-start: 8px;
          inset-inline-end: 8px;
        }
      }
    }
  }

  .act {
    display: flex;
    flex-direction: column;
    gap: 8px;

    > p {
      text-align: center;
    }

    /* one after another: the sheet stays open for the next note */
    > .again {
      align-self: flex-end;
    }

    /* a computer: one row along the columns' width, the hint at the start, the button at the end */
    @media (--desktop) {
      flex-direction: row;
      align-items: center;
      gap: 20px;

      > p {
        order: -1;
        margin-inline-end: auto;
        text-align: start;
      }

      > .again {
        align-self: center;
      }

      > button {
        order: 1;
        min-width: 240px;
      }
    }
  }
}
</style>
