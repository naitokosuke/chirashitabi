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
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  useId,
  useTemplateRef,
  watch,
} from "vue";

import { CtChip, useFlip } from "../../../ui/index";

import { useI18n } from "../../i18n/useI18n";

import backIcon from "../../icons/back.svg";
import closeIcon from "../../icons/close.svg";
import Icon from "../../icons/Icon.vue";
import {
  googleMapsLink,
  isShortMapsLink,
  placeFromUrl,
  placeSearchLink,
} from "../place/google-maps";
import type { FoundPlace } from "../place/types";
import { useSync } from "../sync/useSync";
import { FITS_AT, fits, likeness, rankTags, type TagOption } from "../tags/rank";
import { useTags } from "../tags/useTags";
import { OverBudget, RoomFull } from "../worker/api";
import { useWorker } from "../worker/useWorker";

import { imageSrc, shrinkImage } from "./image";
import { blankInput, inputFromNote, normalizeTag, noteText, parseNoteText } from "./input";
import { COLOR_NAMES, COLORS, PAPERS, type NoteColor, type NoteInput } from "./types";
import { useNotes } from "./useNotes";

const props = defineProps<{ mode: FormMode }>();
const emit = defineEmits<{ close: []; save: [input: NoteInput, keepOpen: boolean] }>();
const store = useNotes();
const { notes } = store;
const tags = useTags();
const i18n = useI18n();
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
const form = ref<NoteInput>(startingInput());
const mapsUrl = ref(form.value.mapsUrl ?? "");
/** A short link is on its way to the Worker to be read */
const expanding = ref(false);
/** The short link last sent to be read: a paste reads it at once, and leaving the field after is the same one */
let expandedFrom = "";
function onMapsUrl() {
  Object.assign(form.value, placeFromUrl(mapsUrl.value, form.value.pin));
  const short = mapsUrl.value.trim();
  const api = worker.api;
  if (api === null || !isShortMapsLink(short) || short === expandedFrom) return;
  expandedFrom = short;
  // a shared short link hides its point: the Worker reads where it leads, and the link becomes
  // that one, unless something else was pasted meanwhile
  expanding.value = true;
  api
    .expandLink(short, i18n.locale === "en" ? "en" : "ja")
    .then(({ url, at }) => {
      if (mapsUrl.value.trim() !== short || url === short) return;
      mapsUrl.value = url;
      Object.assign(form.value, placeFromUrl(url, at ?? form.value.pin));
    })
    .catch(() => {
      // the short link stays; the form says it has no point yet
    })
    .finally(() => (expanding.value = false));
}
/** A paste is read at once, once the field holds it, without waiting for the field to be left */
const onMapsPaste = () => setTimeout(onMapsUrl);
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
  form.value.image === null ? null : imageSrc(sync.room.id, form.value.image),
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
    form.value.image = await api.uploadImage(await shrinkImage(file));
    photo.value = "idle";
  } catch (err) {
    photo.value = err instanceof RoomFull ? "full" : "failed";
  }
}
function removePhoto() {
  form.value.image = null;
}

// ---- tags Clef finds fitting: asked by itself once the words settle, or with a tap at first ----
type TagState = "idle" | "asking" | "none" | "failed" | "day" | "trip";
const tagState = ref<TagState>("idle");
const TAG_STATE = {
  asking: "form.tagsAsking",
  none: "form.tagsNone",
  failed: "form.tagsFailed",
  day: "form.tagsLimit",
  trip: "form.tagsTripLimit",
} as const satisfies Record<Exclude<TagState, "idle">, string>;
const offered = ref<{ tag: string; p: number; isNew: boolean }[]>([]);
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
    offered.value = got;
    // nothing fitting is worth saying only to the one who asked
    tagState.value = byTap && !got.some((t) => t.p >= FITS_AT) ? "none" : "idle";
  } catch (err) {
    if (of !== memo) return;
    // refused or failed: Clef stops asking by itself for this memo
    asks = MAX_ASKS;
    tagState.value = err instanceof OverBudget ? err.ceiling : "failed";
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
const candidates = ref<string[]>([]);
watch(
  () => worker.api,
  (api) => {
    api
      ?.tagCandidates()
      .then((c) => (candidates.value = c))
      .catch(() => {
        // the tags in use still rank; Clef's answers bring the candidates too
      });
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
const flip = useFlip();
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
type PlaceState = "idle" | "asking" | "none" | "failed" | "day" | "trip";
const placeState = ref<PlaceState>("idle");
const PLACE_STATE = {
  asking: "form.placesAsking",
  none: "form.placesNone",
  failed: "form.placesFailed",
  day: "form.tagsLimit",
  trip: "form.tagsTripLimit",
} as const satisfies Record<Exclude<PlaceState, "idle">, string>;
const found = ref<FoundPlace[]>([]);
async function findPlaces() {
  const api = worker.api;
  if (api === null || placeState.value === "asking") return;
  const { title, body, tags: inline } = parseNoteText(text.value);
  placeState.value = "asking";
  found.value = [];
  try {
    found.value = await api.findPlaces({
      title,
      body,
      tags: [...form.value.tags, ...inline],
      lang: i18n.locale === "en" ? "en" : "ja",
    });
    placeState.value = found.value.length === 0 ? "none" : "idle";
  } catch (err) {
    placeState.value = err instanceof OverBudget ? err.ceiling : "failed";
  }
}
/**
 * The chosen place becomes the memo's link, and its point the pin, as a pasted link would; when
 * OpenStreetMap knows its opening hours they go under the memo's words, once, for the booklet
 */
function choosePlace(p: FoundPlace) {
  mapsUrl.value = placeSearchLink(p.name, p.at);
  onMapsUrl();
  if (p.hours !== null) {
    // the label from the messages, the hours as they are: the memo's words keep no isolating marks
    const line = `${i18n.t("form.hours")} ${p.hours}`;
    if (!text.value.includes(line)) text.value = `${text.value.trimEnd()}\n${line}`;
  }
  found.value = [];
}

/**
 * A memo started at a point pinned on the map gets that point's link at once; then OpenStreetMap
 * says what is there, and the link names it and an empty title takes its name. Nothing the
 * person has typed or pasted meanwhile is overwritten.
 */
const naming = ref(false);
/** The title and link came from OpenStreetMap: its credit is shown, as its licence asks */
const namedByOsm = ref(false);
function nameThePin() {
  const at = form.value.pin;
  if (editing.value || at === null) return;
  mapsUrl.value = googleMapsLink(at);
  onMapsUrl();
  const auto = mapsUrl.value;
  const api = worker.api;
  if (api === null) return;
  naming.value = true;
  api
    .whereIs(at, i18n.locale === "en" ? "en" : "ja")
    .then((place) => {
      if (place === null) return;
      if (mapsUrl.value === auto) {
        mapsUrl.value = placeSearchLink(place.name, at);
        onMapsUrl();
      }
      if (text.value.trim() === "")
        text.value =
          place.hours === null
            ? place.name
            : `${place.name}\n${i18n.t("form.hours")} ${place.hours}`;
      namedByOsm.value = true;
    })
    .catch(() => {
      // the link to the point is there already; a name is a nicety
    })
    .finally(() => (naming.value = false));
}
nameThePin();

const textEl = useTemplateRef<HTMLTextAreaElement>("textEl");
const focusText = () => nextTick(() => textEl.value?.focus());
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
const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
onMounted(() => {
  if (!docked.value) window.addEventListener("keydown", onKey);
});
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKey);
  if (!docked.value && opener !== null && opener !== document.body)
    setTimeout(() => opener.isConnected && opener.focus());
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
  if (t !== "" && !form.value.tags.includes(t)) form.value.tags.push(t);
}
function commitTag() {
  if (tagInput.value.trim() !== "") {
    addTag(tagInput.value);
    tagInput.value = "";
  }
}
function removeTag(t: string) {
  form.value.tags.splice(form.value.tags.indexOf(t), 1);
}
function setColor(c: NoteColor) {
  form.value.color = c;
}

function submit() {
  commitTag();
  const { title, body, tags: inline } = parseNoteText(text.value);
  onMapsUrl();
  const input: NoteInput = {
    title,
    body,
    tags: [...new Set([...form.value.tags, ...inline])],
    color: form.value.color,
    mapsUrl: form.value.mapsUrl,
    pin: form.value.pin,
    image: form.value.image,
  };
  if (target.value.kind === "edit") {
    store.update(target.value.id, input);
    emit("close");
    return;
  }
  if (docked.value) {
    emit("save", input, true);
    // a fresh sheet for the next one
    form.value = startingInput();
    mapsUrl.value = "";
    text.value = "";
    forgetTags();
    focusText();
    return;
  }
  emit("save", input, keepOpen.value);
  if (keepOpen.value) {
    text.value = "";
    forgetTags();
    focusText();
  }
}
</script>

<template>
  <form :data-docked="docked || undefined" @submit.prevent="submit">
    <!-- no bar: as a sheet, the way back floats where a bar would be; the title opens the page -->
    <button v-if="mode.kind === 'sheet'" class="back" type="button" @click="() => emit('close')">
      <Icon :size="16" :src="backIcon" />{{ mode.back }}
    </button>
    <div>
      <h2 class="title">{{ i18n.t(editing ? "form.titleEdit" : "form.titleNew") }}</h2>
      <div>
        <label :for="`${id}-text`">{{ i18n.t("form.note") }}</label>
        <textarea
          :id="`${id}-text`"
          ref="textEl"
          v-model="text"
          rows="4"
          :placeholder="i18n.t('form.notePlaceholder')"
        ></textarea>
      </div>
      <div>
        <label :for="`${id}-tag`">{{ i18n.t("form.tags") }}</label>
        <div class="tagbox">
          <CtChip v-for="t in form.tags" :key="t" selected @click="() => removeTag(t)">#{{ t }} <Icon
              :size="12"
              :src="closeIcon"
            /></CtChip>
          <input
            :id="`${id}-tag`"
            v-model="tagInput"
            enterkeyhint="done"
            :placeholder="i18n.t('form.tagPlaceholder')"
            @keydown.enter.prevent="commitTag"
            @blur="commitTag"
          />
        </div>
        <!-- the tags that fit the words go first; what Clef offered is among them, a new one marked -->
        <div ref="rowEl" class="recent">
          <CtChip
            v-for="o in shown"
            :key="o.name"
            :data-flip="o.name"
            :data-fit="fits(o, text) || undefined"
            :data-new="o.isNew || undefined"
            @click="() => addTag(o.name)"
          >#{{ o.name }}<small v-if="o.isNew">{{ i18n.t("form.newTag") }}</small></CtChip>
        </div>
        <!-- Clef looks at the words and the photo; what it finds fitting moves up the row -->
        <div v-if="worker.api !== null && (askByTap || tagState !== 'idle')" class="suggested">
          <button
            v-if="askByTap"
            type="button"
            :disabled="tagState === 'asking' || !text.trim()"
            :aria-busy="tagState === 'asking'"
            @click="() => askForTags(true)"
          >{{ i18n.t("form.suggestTags") }}</button>
          <p v-if="tagState !== 'idle'" aria-live="polite">{{ i18n.t(TAG_STATE[tagState]) }}</p>
        </div>
      </div>
      <div>
        <label :for="`${id}-maps`">{{ i18n.t("form.place") }}</label>
        <input
          :id="`${id}-maps`"
          v-model="mapsUrl"
          inputmode="url"
          type="url"
          :placeholder="i18n.t('form.mapsPlaceholder')"
          @change="onMapsUrl"
          @paste="onMapsPaste"
        />
        <p aria-live="polite">{{
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
        }}</p>
        <!-- or found from the memo's words: the agent names it, OpenStreetMap places it, one is chosen -->
        <div v-if="worker.api !== null" class="places">
          <button
            type="button"
            :disabled="placeState === 'asking' || !text.trim()"
            :aria-busy="placeState === 'asking'"
            @click="findPlaces"
          >{{ i18n.t("form.findPlace") }}</button>
          <ul v-if="found.length > 0">
            <li v-for="p in found" :key="`${p.at.lat},${p.at.lng}`">
              <button type="button" @click="() => choosePlace(p)">
                <span>{{ p.name }}</span>
                <small>{{ p.address }}</small>
              </button>
            </li>
          </ul>
          <p v-if="found.length > 0 || namedByOsm" class="credit">{{
            i18n.t("form.placesCredit")
          }}</p>
          <p v-if="placeState !== 'idle'" aria-live="polite">{{
            i18n.t(PLACE_STATE[placeState])
          }}</p>
        </div>
      </div>
      <div v-if="worker.api !== null">
        <label :for="`${id}-photo`">{{ i18n.t("form.photo") }}</label>
        <figure v-if="photoSrc !== null">
          <img alt="" :src="photoSrc" />
          <button type="button" @click="removePhoto">{{ i18n.t("form.removePhoto") }}</button>
        </figure>
        <input
          :id="`${id}-photo`"
          accept="image/*"
          type="file"
          :disabled="photo === 'sending'"
          @change="onPhoto"
        />
        <p v-if="photo !== 'idle'" aria-live="polite">{{ i18n.t(PHOTO_STATE[photo]) }}</p>
      </div>
      <fieldset>
        <legend>{{ i18n.t("form.color") }}</legend>
        <div>
          <button
            v-for="c in COLORS"
            :key="c"
            type="button"
            :style="`background:${PAPERS[c]}`"
            :aria-label="i18n.t(COLOR_NAMES[c])"
            :aria-pressed="form.color === c"
            @click="() => setColor(c)"
          ></button>
        </div>
      </fieldset>
    </div>
    <footer>
      <label v-if="!docked && !editing" class="again"><input v-model="keepOpen" type="checkbox" />{{ i18n.t("form.addAnother") }}</label>
      <button type="submit" :disabled="!text.trim() || photo === 'sending'">{{
        i18n.t(saveLabel)
      }}</button>
      <p v-if="!editing">{{ i18n.t(hintKey) }}</p>
    </footer>
  </form>
</template>

<style scoped>
@import "../../../ui/styles/media.css";

form {
  position: absolute;
  inset: 0;
  z-index: var(--z-sheet);
  background: var(--bg);
  display: flex;
  flex-direction: column;

  /* the memo tab: a view in the stack like the others, not a sheet over them */
  &[data-docked] {
    z-index: auto;
    isolation: isolate;

    /* above the dock, with the rest of the views */
    padding-block-end: var(--dock-clear);

    /* a page like home: a large title at the top */
    > div {
      padding-block-start: var(--page-top);

      > .title {
        font-size: var(--font-display);
        line-height: 1.2;
      }
    }
  }

  /* the way back, floating in the row where a bar would be */
  > .back {
    position: absolute;
    inset-inline-start: 12px;
    inset-block-start: calc(env(safe-area-inset-top, 0px) + (var(--top-row) - var(--tap)) / 2);
    z-index: var(--z-chrome);
    min-height: var(--tap);
    padding: 0 12px 0 8px;
    border-radius: 999px;
    border: 0;
    background: var(--glass);
    backdrop-filter: blur(16px) saturate(1.5);
    -webkit-backdrop-filter: blur(16px) saturate(1.5);
    box-shadow:
      inset 0 0 0 1px color-mix(in oklch, var(--line) 80%, transparent),
      var(--shadow-tool);
    color: var(--muted);
    font-size: var(--font-sm);
    font-weight: 700;
    display: inline-flex;
    align-items: center;
    gap: 4px;

    @media (--can-hover) {
      &:hover {
        color: var(--ink);
      }
    }
  }

  > div {
    flex: 1;
    overflow-y: auto;
    /* a sheet's page starts under its way back; the memo tab's like any page */
    padding: var(--top-clear) var(--page-margin) 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;

    > .title {
      margin: 0;
      font-size: var(--font-4xl);
      font-weight: 700;
      line-height: 1.25;
    }

    /* a field's name, above it */
    > div > label,
    > fieldset > legend {
      font-size: var(--font-sm);
      font-weight: 700;
      color: var(--muted);
      display: block;
      margin-bottom: 6px;
      padding: 0;
    }

    > div {
      > textarea {
        width: 100%;
        font: inherit;
        font-size: var(--font-xl);
        padding: 12px;
        border: 1px solid var(--line);
        border-radius: 10px;
        background: var(--surface);
        color: var(--ink);
        resize: none;
        min-height: 120px;
      }

      > .tagbox {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        align-items: center;
        min-height: 46px;
        padding: 6px 8px;
        border: 1px solid var(--line);
        border-radius: 10px;
        background: var(--surface);

        /* the box is the field: it takes the focus ring for the input inside it */
        &:focus-within {
          outline: 2px solid var(--ink);
          outline-offset: 2px;
        }

        > button {
          min-height: 32px;
        }

        > input {
          flex: 1;
          min-width: 80px;
          border: 0;
          background: transparent;
          font: inherit;
          font-size: var(--font-base);
          color: var(--ink);
          height: 32px;
          outline: none;
        }
      }

      > .recent {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 8px;

        /* the words name it, or Clef found it likely: it reads as a pick, not only as one in use */
        > [data-fit] {
          color: var(--ink);
          border-color: color-mix(in oklch, var(--ink) 45%, var(--line));
        }

        /* Clef's new tag: no note has it yet, so its edge is dashed as the agent's things are */
        > [data-new] {
          border-style: dashed;
        }

        small {
          font-size: var(--font-2xs);
          font-weight: 400;
          color: var(--muted);
        }
      }

      /* the ask for tags, dashed like every ask of the agent's, then what came back */
      /* the ask for the place, dashed like every ask of the agent's, then the places to choose */
      > .places {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 8px;
        margin-top: 8px;

        > button {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          min-height: var(--tap);
          padding: 0 12px;
          border-radius: 999px;
          background: var(--surface);
          border: 1px dashed color-mix(in oklch, var(--ink) 30%, var(--line));
          font-size: var(--font-sm);
          font-weight: 700;
          color: var(--ink);

          &:disabled {
            color: var(--muted);
          }

          &[aria-busy="true"]::before {
            content: "";
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background: currentColor;
            animation: breathe 1s ease-in-out infinite alternate;

            @media (--reduced-motion) {
              animation: none;
            }
          }
        }

        /* each place: its name, and where it is under it; a tap makes it the memo's */
        > ul {
          list-style: none;
          margin: 0;
          padding: 0;
          display: grid;
          gap: 6px;
          align-self: stretch;

          button {
            width: 100%;
            display: grid;
            gap: 2px;
            padding: 10px 12px;
            text-align: start;
            border-radius: 10px;
            background: var(--surface);
            border: 1px dashed color-mix(in oklch, var(--ink) 30%, var(--line));
            color: var(--ink);

            > span {
              font-size: var(--font-md);
              font-weight: 700;
            }

            > small {
              font-size: var(--font-xs);
              color: var(--muted);
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
            }

            @media (--can-hover) {
              &:hover {
                border-style: solid;
                border-color: var(--ink);
              }
            }

            &:focus-visible {
              outline: 2px solid var(--ink);
              outline-offset: 2px;
            }
          }
        }

        > p {
          margin: 0;
          font-size: var(--font-xs);
          color: var(--muted);
        }
      }

      > .suggested {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px;
        margin-top: 8px;

        /* the ask itself */
        > button:first-child {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          min-height: var(--tap);
          padding: 0 12px;
          border-radius: 999px;
          background: var(--surface);
          border: 1px dashed color-mix(in oklch, var(--ink) 30%, var(--line));
          font-size: var(--font-sm);
          font-weight: 700;
          color: var(--ink);

          &:disabled {
            color: var(--muted);
          }

          /* waiting on Clef: a dot breathing before the label */
          &[aria-busy="true"]::before {
            content: "";
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background: currentColor;
            animation: breathe 1s ease-in-out infinite alternate;

            @media (--reduced-motion) {
              animation: none;
            }
          }
        }

        > p {
          flex-basis: 100%;
          margin: 0;
          font-size: var(--font-xs);
          color: var(--muted);
        }
      }

      > input {
        width: 100%;
        font: inherit;
        font-size: var(--font-base);
        padding: 10px 12px;
        border: 1px solid var(--line);
        border-radius: 10px;
        background: var(--surface);
        color: var(--ink);

        /* the photo picker: the browser's own control, its button made one of ours */
        &[type="file"] {
          padding: 8px;
          font-size: var(--font-sm);
          color: var(--muted);

          &::file-selector-button {
            margin-inline-end: 10px;
            min-height: 32px;
            padding: 0 12px;
            border: 1px solid var(--line);
            border-radius: 999px;
            background: var(--bg);
            font: inherit;
            font-weight: 700;
            color: var(--ink);
          }
        }
      }

      /* the card's picture, as it will show, with a way to take it off */
      > figure {
        position: relative;
        margin: 0 0 8px;

        > img {
          display: block;
          width: 100%;
          max-height: 240px;
          object-fit: cover;
          border-radius: 10px;
          background: var(--wash);
        }

        > button {
          position: absolute;
          inset-block-start: 8px;
          inset-inline-end: 8px;
          min-height: 32px;
          padding: 0 12px;
          border-radius: 999px;
          background: var(--surface);
          box-shadow: var(--shadow-tool);
          font-size: var(--font-sm);
          font-weight: 700;
        }
      }

      > p {
        margin: 6px 0 0;
        font-size: var(--font-xs);
        color: var(--muted);
      }
    }

    > fieldset {
      min-inline-size: 0;
      margin: 0;
      padding: 0;
      border: 0;

      > div {
        display: flex;
        gap: 10px;

        > button {
          width: var(--tap);
          height: var(--tap);
          border-radius: 50%;
          /* a hairline keeps white paper visible on a light desk */
          box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--paper-ink) 14%, transparent);

          &[aria-pressed="true"] {
            outline: 2px solid var(--ink);
            outline-offset: 2px;
          }
        }
      }
    }
  }

  > footer {
    padding: 10px var(--page-margin) calc(16px + env(safe-area-inset-bottom, 0px));
    border-top: 1px solid var(--line);
    background: var(--bg);
    display: flex;
    flex-direction: column;
    gap: 8px;

    > button {
      height: 52px;
      border-radius: 999px;
      background: var(--ink);
      color: var(--on-ink);
      font-size: var(--font-xl);
      font-weight: 700;

      &:disabled {
        opacity: 0.4;
      }

      @media (--can-hover) {
        &:not(:disabled):hover {
          box-shadow: var(--shadow-float);
        }
      }
    }

    > p {
      margin: 0;
      text-align: center;
      font-size: var(--font-xs);
      color: var(--muted);
    }

    /* one after another: the sheet stays open for the next note */
    > .again {
      align-self: flex-end;
      display: flex;
      align-items: center;
      gap: 8px;
      min-height: var(--tap);
      font-size: var(--font-sm);
      color: var(--muted);

      > input {
        width: 20px;
        height: 20px;
        margin: 0;
        accent-color: var(--ink);
      }
    }
  }

  /* the memo tab's footer sits on the dock's footprint, not on the screen's edge */
  &[data-docked] > footer {
    padding-block-end: 12px;
  }
}

@keyframes breathe {
  from {
    opacity: 0.25;
  }
  to {
    opacity: 1;
  }
}
</style>
