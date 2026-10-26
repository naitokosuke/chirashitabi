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
  useId,
  useTemplateRef,
  watch,
} from "vue";

import {
  CtBackButton,
  CtButton,
  CtCheck,
  CtChip,
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

import { MAX_BODY, MAX_TAGS, MAX_TITLE } from "../../../contract/room";
import backIcon from "../../icons/back.svg";
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
  type HttpUrl,
} from "../place/google-maps";
import { readHours } from "../place/hours";
import type { FoundPlace } from "../place/types";
import { useInRoom } from "../sync/InRoom.vue";
import { useOffline } from "../sync/useOffline";
import { useTags } from "../tags/useTags";
import { durationChoices, durationMessage } from "../trip/format";
import type { OverBudget } from "../worker/types";

import { imageSrc, shrinkImage } from "./image";
import {
  blankInput,
  bookingDraft,
  bookingOf,
  changes,
  chosenBooking,
  inputFromNote,
  normalizeTag,
  noteText,
  parseNoteText,
  tooMuchOf,
} from "./input";
import TagsField from "./TagsField.vue";
import { type NoteInput, TODO_TAG } from "./types";
import { useAsk } from "./useAsk";
import { useNotes } from "./useNotes";

const props = defineProps<{ mode: FormMode }>();
const emit = defineEmits<{ close: []; save: [input: NoteInput, keepOpen: boolean] }>();
const store = useNotes();
const { notes } = store;
const tags = useTags();
const i18n = useI18n();
/** The room the memo is written in, and the Worker that reads and finds for it */
const here = useInRoom();
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

/**
 * The short link last sent to be read, on its way to the Worker or read: a paste reads it at
 * once, and leaving the field after is the same one
 */
type Expand = { kind: "idle" } | { kind: "expanding" | "expanded"; short: string };
/**
 * What reading the page is doing, or what it found: the site, or why nothing; with the link
 * read (the page's own once found), as leaving the field after a paste is the same one
 */
type Preview =
  | { kind: "idle" }
  | { kind: "place" }
  | { kind: "fetching" | "none" | "failed" | OverBudget["ceiling"]; url: HttpUrl }
  | { kind: "found"; site: string; url: HttpUrl };
/** What sending the picture is doing, or why it is not on the card */
type Photo = { kind: "idle" | "sending" | "failed" | "full" };
/** The places found to choose from, or what the ask is doing or why it found none */
type Places =
  | { kind: "idle"; found: FoundPlace[] }
  | { kind: "asking" | "none" | "failed" | OverBudget["ceiling"] };
/** Naming the point pinned on the map: on its way, or done (OpenStreetMap's credit is due) */
type Naming = { kind: "idle" | "naming" | "named" };

/**
 * One memo being written: what its fields say, and what is being asked for it. Adding another
 * replaces it whole, so nothing of the last memo is left on the next, and an answer still on
 * its way lands on the memo it was asked for.
 */
function newMemo() {
  const start = startingInput();
  return {
    /** What the inputs start from; from here on they are the form's */
    form: start,
    mapsUrl: start.mapsUrl ?? "",
    /** When the place is open, as written (OpenStreetMap's way); blank for not said */
    hours: start.hours ?? "",
    /**
     * Whether it has to be booked: none, still to book (by a day), or booked (its number and
     * page). Another choice from the list starts blank (chosenBooking)
     */
    booking: bookingDraft(start.booking),
    /** A to-do: the day it is to be done by */
    due: start.due?.toString() ?? "",
    /** Who is to do it (or to book it) */
    assignee: start.assignee ?? "",
    /** Where the idea came from: a page, read by the Worker for its title, line and picture */
    link: start.link ?? "",
    text: noteText(start),
    /** The tag being typed: it is the memo's once it is added, or once the memo is saved */
    tagInput: "",
    expand: useAsk<Expand>({ kind: "idle" }),
    preview: useAsk<Preview>({ kind: "idle" }),
    photo: useAsk<Photo>({ kind: "idle" }),
    places: useAsk<Places>({ kind: "idle", found: [] }),
    naming: useAsk<Naming>({ kind: "idle" }),
  };
}
const memo = ref(newMemo());

// ---- a to-do: the day it is to be done by, and who is to do it (or to book it) ----
const { members } = useMembers();
const people = computed(() => (members.value ?? []).filter((m) => m.kind === "person"));
const isTodo = computed(() => memo.value.form.tags.includes(TODO_TAG));
/** Someone is to do it: a to-do, or a plan still to book */
const hasAssignee = computed(() => isTodo.value || memo.value.booking.state === "needed");
/** Whom the field names, while they are in the room */
const assigneeOf = (): MemberId | null =>
  people.value.find((m) => m.id === memo.value.assignee)?.id ?? null;
/** Written, but past what the booklet can read: it is kept as it is and checks nothing */
const hoursUnread = computed(() => {
  const { hours } = memo.value;
  return hours.trim() !== "" && readHours(hours) === null;
});
async function onMapsUrl() {
  const d = memo.value;
  Object.assign(d.form, placeFromUrl(d.mapsUrl, d.form.pin));
  const short = d.mapsUrl.trim();
  if (cut.offline || !isShortMapsLink(short)) return;
  if (d.expand.state.kind !== "idle" && d.expand.state.short === short) return;
  // a shared short link hides its point: the Worker reads where it leads, and the link becomes
  // that one, unless something else was pasted meanwhile
  const turn = d.expand.ask({ kind: "expanding", short });
  try {
    const answer = await here.api.expandLink(short, i18n.locale);
    // past the budget the short link stays, as when it could not be read; a link pasted
    // meanwhile is the newer one's
    if (!turn.current() || !answer.ok || d.mapsUrl.trim() !== short) return;
    const { url, at } = answer.value;
    if (url === short) return;
    d.mapsUrl = url;
    Object.assign(d.form, placeFromUrl(url, at ?? d.form.pin));
  } catch {
    // the short link stays; the form says it has no point yet
  } finally {
    // a short link sent meanwhile is still on its way: it says when it is done
    turn.settle({ kind: "expanded", short });
  }
}
/** A paste is read at once, once the field holds it, without waiting for the field to be left */
const onMapsPaste = () => setTimeout(onMapsUrl);

// ---- where the idea came from: a page, read by the Worker for its title, line and picture ----
const LINK_STATE = {
  fetching: "form.linkFetching",
  none: "form.linkNone",
  failed: "form.linkFailed",
  place: "form.linkIsPlace",
  day: "form.linkLimit",
  trip: "form.linkTripLimit",
} as const satisfies Record<Exclude<Preview["kind"], "idle" | "found">, string>;
/**
 * The page behind the link, once: its title and line fill words not written yet, its picture
 * a card with none. A Google Maps link is the place's, not a page to read
 */
async function onLink() {
  const d = memo.value;
  const raw = d.link.trim();
  const url = parseHttpUrl(raw);
  if (url === null) return;
  const read = d.preview.state;
  if (read.kind !== "idle" && read.kind !== "place" && read.url === url) return;
  if (isMapsLink(url)) {
    d.preview.set({ kind: "place" });
    return;
  }
  if (cut.offline) return;
  const turn = d.preview.ask({ kind: "fetching", url });
  const answer = await here.api.preview(url).catch(() => null);
  // what came back, a failure too, is about this link only: one written meanwhile is the newer one's
  if (!turn.current() || d.link.trim() !== raw) return;
  if (answer === null) {
    turn.settle({ kind: "failed", url });
    return;
  }
  if (!answer.ok) {
    turn.settle({ kind: answer.reason.ceiling, url });
    return;
  }
  const found = answer.value;
  if (found === null) {
    turn.settle({ kind: "none", url });
    return;
  }
  // the page's own link is the one read too: leaving the field after is no new link
  d.link = found.url;
  if (d.text.trim() === "")
    d.text = [found.title, found.description].filter((s) => s !== null).join("\n");
  if (d.form.image === null && found.image !== null) d.form.image = found.image;
  turn.settle({ kind: "found", site: found.site, url: found.url });
}
const onLinkPaste = () => setTimeout(onLink);
const hasPin = () => memo.value.form.pin !== null;
const keepOpen = ref(false);

// ---- a picture on the card: shrunk on the device, kept by the room, then named by its id ----
const PHOTO_STATE = {
  sending: "form.photoSending",
  failed: "form.photoFailed",
  full: "form.photoFull",
} as const satisfies Record<Exclude<Photo["kind"], "idle">, string>;
const photoSrc = computed(() => {
  const { image } = memo.value.form;
  return image === null ? null : imageSrc(here.room, image);
});
async function onPhoto(e: Event) {
  const input = e.target;
  if (!(input instanceof HTMLInputElement)) return;
  const file = input.files?.[0];
  input.value = ""; // the same photo can be picked again after a failure
  if (file === undefined) return;
  const d = memo.value;
  const turn = d.photo.ask({ kind: "sending" });
  try {
    const kept = await here.api.uploadImage(await shrinkImage(file));
    if (!turn.current()) return;
    if (kept.ok) d.form.image = kept.value;
    turn.settle({ kind: kept.ok ? "idle" : "full" });
  } catch {
    turn.settle({ kind: "failed" });
  }
}
function removePhoto() {
  memo.value.form.image = null;
}

// ---- where the memo is: the agent names the place, OpenStreetMap finds it; one is chosen ----
const PLACE_STATE = {
  asking: "form.placesAsking",
  none: "form.placesNone",
  failed: "form.placesFailed",
  day: "form.placesLimit",
  trip: "form.placesTripLimit",
} as const satisfies Record<Exclude<Places["kind"], "idle">, string>;
/** What there is to choose from: only once an ask found some */
const found = computed(() => {
  const { state } = memo.value.places;
  return state.kind === "idle" ? state.found : [];
});
async function findPlaces() {
  const d = memo.value;
  if (d.places.state.kind === "asking") return;
  const { title, body, tags: inline } = parseNoteText(d.text);
  const turn = d.places.ask({ kind: "asking" });
  try {
    const answer = await here.api.findPlaces({
      title,
      body,
      tags: [...d.form.tags, ...inline],
      lang: i18n.locale,
    });
    if (!answer.ok) turn.settle({ kind: answer.reason.ceiling });
    else if (answer.value.length === 0) turn.settle({ kind: "none" });
    else turn.settle({ kind: "idle", found: answer.value });
  } catch {
    turn.settle({ kind: "failed" });
  }
}
/**
 * The chosen place becomes the memo's link, and its point the pin, as a pasted link would; its
 * opening hours, when OpenStreetMap knows them, become the memo's, for the booklet to check
 */
function choosePlace(p: FoundPlace) {
  const d = memo.value;
  d.mapsUrl = placeSearchLink(p.name, p.at);
  void onMapsUrl();
  if (p.hours !== null) d.hours = p.hours;
  d.places.set({ kind: "idle", found: [] });
}

/**
 * A memo started at a point pinned on the map gets that point's link at once; then OpenStreetMap
 * says what is there, and the link names it and an empty title takes its name. Nothing the
 * person has typed or pasted meanwhile is overwritten. Once it named the place, its credit is
 * shown, as its licence asks.
 */
async function nameThePin() {
  const d = memo.value;
  const at = d.form.pin;
  if (editing.value || at === null) return;
  d.mapsUrl = googleMapsLink(at);
  void onMapsUrl();
  const auto = d.mapsUrl;
  const turn = d.naming.ask({ kind: "naming" });
  // the link to the point is there already; a name is a nicety
  const place = await here.api.whereIs(at, i18n.locale).catch(() => null);
  if (!turn.current()) return;
  if (place === null) {
    turn.settle({ kind: "idle" });
    return;
  }
  if (d.mapsUrl === auto) {
    d.mapsUrl = placeSearchLink(place.name, at);
    void onMapsUrl();
  }
  if (d.text.trim() === "") d.text = place.name;
  if (place.hours !== null && d.hours.trim() === "") d.hours = place.hours;
  turn.settle({ kind: "named" });
}
void nameThePin();
/** What the place field says under it: what is being asked about it, else whether it is pinned */
const placeHint = computed(() => {
  const d = memo.value;
  if (d.naming.state.kind === "naming") return "form.placeNaming";
  if (d.expand.state.kind === "expanding") return "form.placeExpanding";
  if (hasPin()) return "form.pinned";
  if (d.mapsUrl.trim() !== "") return "form.urlNoPinFind";
  return "form.unpinnedFind";
});

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

/** How long it takes there; the booklet says when it ends from it */
function setMinutes(value: string) {
  memo.value.form.minutes = value === "" ? null : Number(value);
}
/** "1 h 30 min" */
function long(minutes: number) {
  const d = durationMessage(minutes);
  return i18n.t(d.id, d.params);
}

/** The memo as the fields say it */
function fieldsInput(): NoteInput {
  const { form, text, tagInput, hours, link, booking, due } = memo.value;
  const { title, body, tags: inline } = parseNoteText(text);
  const typed = normalizeTag(tagInput);
  return {
    title,
    body,
    tags: [...new Set([...form.tags, ...(typed === null ? [] : [typed]), ...inline])],
    color: form.color,
    mapsUrl: form.mapsUrl,
    pin: form.pin,
    image: form.image,
    minutes: form.minutes,
    hours: hours.trim() === "" ? null : hours.trim(),
    link: parseHttpUrl(link.trim()),
    booking: bookingOf(booking),
    // a day and someone only while it is a to-do (or, for someone, still to book)
    due: isTodo.value && due !== "" ? Temporal.PlainDate.from(due) : null,
    assignee: hasAssignee.value ? assigneeOf() : null,
  };
}
/** What the fields said when the form opened: an edit sends only what was changed from it */
const opened = fieldsInput();

/** What is said of the words the room would refuse, and the most it keeps of them */
const TOO_MUCH = {
  title: { id: "form.titleTooLong", max: MAX_TITLE },
  body: { id: "form.bodyTooLong", max: MAX_BODY },
  tags: { id: "form.tooManyTags", max: MAX_TAGS },
} as const;
/**
 * What the room would refuse of the memo as the fields say it (input.ts); null while it fits.
 * It is said under the words and the memo is not saved until it fits, so nothing is lost.
 */
const tooMuch = computed(() => tooMuchOf(fieldsInput()));

function submit() {
  if (tooMuch.value !== null) return;
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
  // a fresh memo for the next one; from a point on the map, at that point again. The words
  // taken back with it, the tags field forgets what Clef made of them
  memo.value = newMemo();
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
              v-model="memo.text"
              rows="4"
              size="lg"
              :placeholder="i18n.t('form.notePlaceholder')"
              :aria-invalid="tooMuch !== null"
              :aria-describedby="`${id}-too-much`"
            />
            <!-- the live region stays, so the words landing in it are read out -->
            <CtHint :id="`${id}-too-much`" aria-live="polite" class="too-much" danger>{{
              tooMuch === null ? "" : i18n.t(TOO_MUCH[tooMuch].id, { max: TOO_MUCH[tooMuch].max })
            }}</CtHint>
          </CtField>
          <TagsField
            v-model:draft="memo.tagInput"
            v-model:tags="memo.form.tags"
            :image="memo.form.image"
            :text="memo.text"
          />
          <CtField :for="`${id}-link`" :label="i18n.t('form.link')">
            <CtInput
              :id="`${id}-link`"
              v-model="memo.link"
              inputmode="url"
              type="url"
              :placeholder="i18n.t('form.linkPlaceholder')"
              @change="onLink"
              @paste="onLinkPaste"
            />
            <CtHint v-if="memo.preview.state.kind === 'found'" aria-live="polite">{{
              i18n.t("form.linkFound", { site: memo.preview.state.site })
            }}</CtHint>
            <CtHint v-else-if="memo.preview.state.kind !== 'idle'" aria-live="polite">{{
              i18n.t(LINK_STATE[memo.preview.state.kind])
            }}</CtHint>
            <CtHint v-else-if="cut.offline">{{ i18n.t("offline.unavailable") }}</CtHint>
          </CtField>
          <!-- a phone: the last field, as it was -->
          <CtField class="photo" :for="`${id}-photo`" :label="i18n.t('form.photo')">
            <figure v-if="photoSrc !== null">
              <img alt="" :src="photoSrc" />
              <CtChip float @click="removePhoto">{{ i18n.t("form.removePhoto") }}</CtChip>
            </figure>
            <CtFileInput
              :id="`${id}-photo`"
              accept="image/*"
              :disabled="memo.photo.state.kind === 'sending' || cut.offline"
              @change="onPhoto"
            />
            <CtHint v-if="memo.photo.state.kind !== 'idle'" aria-live="polite">{{
              i18n.t(PHOTO_STATE[memo.photo.state.kind])
            }}</CtHint>
            <CtHint v-else-if="cut.offline">{{ i18n.t("offline.unavailable") }}</CtHint>
          </CtField>
        </div>
        <div class="details">
          <CtField :for="`${id}-maps`" :label="i18n.t('form.place')">
            <CtInput
              :id="`${id}-maps`"
              v-model="memo.mapsUrl"
              inputmode="url"
              type="url"
              :placeholder="i18n.t('form.mapsPlaceholder')"
              @change="onMapsUrl"
              @paste="onMapsPaste"
            />
            <CtHint aria-live="polite">{{ i18n.t(placeHint) }}</CtHint>
            <!-- or found from the memo's words: the agent names it, OpenStreetMap places it, one is chosen -->
            <div class="places">
              <CtButton
                variant="ask"
                :disabled="memo.places.state.kind === 'asking' || !memo.text.trim() || cut.offline"
                :busy="memo.places.state.kind === 'asking'"
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
              <CtHint v-if="found.length > 0 || memo.naming.state.kind === 'named'">{{
                i18n.t("form.placesCredit")
              }}</CtHint>
              <CtHint v-if="memo.places.state.kind !== 'idle'" aria-live="polite">{{
                i18n.t(PLACE_STATE[memo.places.state.kind])
              }}</CtHint>
              <CtHint v-else-if="cut.offline">{{ i18n.t("offline.unavailable") }}</CtHint>
            </div>
          </CtField>
          <CtField :for="`${id}-hours`" :label="i18n.t('form.hours')">
            <CtInput
              :id="`${id}-hours`"
              v-model="memo.hours"
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
              :model-value="memo.booking.state"
              @update:model-value="(state) => (memo.booking = chosenBooking(state))"
            >
              <option value="none">{{ i18n.t("form.bookingNone") }}</option>
              <option value="needed">{{ i18n.t("form.bookingNeeded") }}</option>
              <option value="booked">{{ i18n.t("form.bookingBooked") }}</option>
            </CtSelect>
          </CtField>
          <CtField v-if="isTodo" :for="`${id}-due`" :label="i18n.t('form.due')">
            <CtInput :id="`${id}-due`" v-model="memo.due" type="date" />
          </CtField>
          <CtField v-if="hasAssignee" :for="`${id}-assignee`" :label="i18n.t('form.assignee')">
            <CtSelect :id="`${id}-assignee`" v-model="memo.assignee">
              <option value="">{{ i18n.t("form.assigneeAnyone") }}</option>
              <option v-for="m in people" :key="m.id" :value="m.id">{{ m.name }}</option>
            </CtSelect>
          </CtField>
          <CtField
            v-if="memo.booking.state === 'needed'"
            :for="`${id}-booking-by`"
            :label="i18n.t('form.bookingBy')"
          >
            <CtInput :id="`${id}-booking-by`" v-model="memo.booking.by" type="date" />
          </CtField>
          <template v-else-if="memo.booking.state === 'booked'">
            <CtField :for="`${id}-booking-code`" :label="i18n.t('form.bookingCode')">
              <CtInput
                :id="`${id}-booking-code`"
                v-model="memo.booking.code"
                autocapitalize="characters"
                maxlength="100"
                spellcheck="false"
              />
            </CtField>
            <CtField :for="`${id}-booking-url`" :label="i18n.t('form.bookingUrl')">
              <CtInput
                :id="`${id}-booking-url`"
                v-model="memo.booking.url"
                inputmode="url"
                type="url"
                :placeholder="i18n.t('form.bookingUrlPlaceholder')"
              />
            </CtField>
          </template>
          <CtField :for="`${id}-minutes`" :label="i18n.t('shiori.minutes')">
            <CtSelect
              :id="`${id}-minutes`"
              :model-value="String(memo.form.minutes ?? '')"
              @update:model-value="setMinutes"
            >
              <option value="">{{ i18n.t("form.minutesUnset") }}</option>
              <option v-for="m in durationChoices(memo.form.minutes)" :key="m" :value="String(m)">{{
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
          :disabled="!memo.text.trim() || memo.photo.state.kind === 'sending' || tooMuch !== null"
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

      /* what the room would refuse, kept on the page for its live region: empty, it takes no gap */
      > .too-much:empty {
        position: absolute;
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
