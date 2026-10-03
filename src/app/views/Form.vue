<script lang="ts">
import type { Memo } from "../features/notes/types";
import type { LatLng } from "../features/place/types";

/** What the form is open on: a new memo (pinned when written from the map), or an existing one */
export type FormTarget = { kind: "new"; pin: LatLng | null } | { kind: "edit"; note: Memo };
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

import { CtAppBar, CtChip } from "../../ui/index";

import { useI18n } from "../i18n/useI18n";

import {
  blankInput,
  inputFromNote,
  normalizeTag,
  noteText,
  parseNoteText,
} from "../features/notes/input";
import {
  COLOR_NAMES,
  COLORS,
  PAPERS,
  type NoteColor,
  type NoteInput,
} from "../features/notes/types";
import { useNotes } from "../features/notes/useNotes";
import { placeFromUrl } from "../features/place/google-maps";
import { useTags } from "../features/tags/useTags";
import backIcon from "../icons/back.svg";
import closeIcon from "../icons/close.svg";
import Icon from "../icons/Icon.vue";

/**
 * `from`: the tab the sheet was opened over, so the back control and the copy speak of it.
 * `docked`: the form is the memo tab itself rather than a sheet over a tab: it never closes,
 * every save goes to the canvas and leaves it blank for the next one. `active`: the tab is up.
 */
const props = defineProps<{
  target: FormTarget;
  from: "home" | "canvas" | "memo" | "map" | "shiori";
  docked?: boolean;
  active?: boolean;
}>();
const emit = defineEmits<{ close: []; save: [input: NoteInput, keepOpen: boolean] }>();
const store = useNotes();
const tags = useTags();
const i18n = useI18n();
const id = useId();
const editing = computed(() => props.target.kind === "edit");

const startingInput = (): NoteInput =>
  props.target.kind === "edit"
    ? inputFromNote(props.target.note)
    : blankInput(props.docked ? [] : tags.selected, props.target.pin);
const form = ref<NoteInput>(startingInput());
const mapsUrl = ref(form.value.mapsUrl ?? "");
function onMapsUrl() {
  Object.assign(form.value, placeFromUrl(mapsUrl.value, form.value.pin));
}
const hasPin = () => form.value.pin !== null;
const text = ref(noteText(form.value));
const tagInput = ref("");
const keepOpen = ref(false);
const textEl = useTemplateRef<HTMLTextAreaElement>("textEl");
const focusText = () => nextTick(() => textEl.value?.focus());
onMounted(() => {
  if (!props.docked || props.active === true) focusText();
});
// the memo tab is ready to type into whenever it comes up
watch(
  () => props.active,
  (active) => {
    if (active === true) focusText();
  },
);

// Esc closes the sheet, the way it closes anything that covers something
function onKey(e: KeyboardEvent) {
  if (e.key === "Escape") emit("close");
}
// Focus goes back where it came from once the sheet is gone and the layer under it is live again
const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
onMounted(() => {
  if (!props.docked) window.addEventListener("keydown", onKey);
});
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKey);
  if (!props.docked && opener && opener !== document.body)
    setTimeout(() => opener.isConnected && opener.focus());
});

const BACK = {
  home: "nav.home",
  canvas: "nav.canvas",
  memo: "nav.memo",
  map: "nav.map",
  shiori: "nav.booklet",
} as const;
/** From the map with a place: the note is a pin there (and a card on the desk) */
const atPlace = computed(() => props.from === "map" && hasPin());
/** From the map's stamp with no place yet: it still lands on the canvas, so say so instead of "save to canvas" from a map */
const noPlace = computed(() => props.from === "map" && !hasPin());
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
  props.docked
    ? "form.hintDocked"
    : atPlace.value
      ? "form.hintHere"
      : noPlace.value
        ? "form.hintNoPlace"
        : "form.hint",
);

function addTag(raw: string) {
  const t = normalizeTag(raw);
  if (t && !form.value.tags.includes(t)) form.value.tags.push(t);
}
function commitTag() {
  if (tagInput.value.trim()) {
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
  };
  if (props.target.kind === "edit") {
    store.update(props.target.note.id, input);
    emit("close");
    return;
  }
  if (props.docked) {
    emit("save", input, true);
    // a fresh sheet for the next one
    form.value = startingInput();
    mapsUrl.value = "";
    text.value = "";
    focusText();
    return;
  }
  emit("save", input, keepOpen.value);
  if (keepOpen.value) {
    text.value = "";
    focusText();
  }
}
</script>

<template>
  <form :data-docked="docked || undefined" @submit.prevent="submit">
    <!-- as a tab, the form wears the app bar like every other view -->
    <CtAppBar v-if="docked"><h2>{{ i18n.t("form.titleNew") }}</h2></CtAppBar>
    <header v-else>
      <button type="button" @click="() => emit('close')">
        <Icon :size="16" :src="backIcon" />{{ i18n.t(BACK[from]) }}
      </button>
      <h2>{{ i18n.t(editing ? "form.titleEdit" : "form.titleNew") }}</h2>
      <label v-if="!editing"><input v-model="keepOpen" type="checkbox" />{{ i18n.t("form.addAnother") }}</label>
    </header>
    <div>
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
          <CtChip v-for="t in form.tags" :key="t" selected @click="() => removeTag(t)">#{{ t }} <Icon :size="12" :src="closeIcon" /></CtChip>
          <input
            :id="`${id}-tag`"
            v-model="tagInput"
            enterkeyhint="done"
            :placeholder="i18n.t('form.tagPlaceholder')"
            @keydown.enter.prevent="commitTag"
            @blur="commitTag"
          />
        </div>
        <div class="recent">
          <template v-for="t in tags.tagList.slice(0, 8)" :key="t.name">
            <CtChip v-if="!form.tags.includes(t.name)" @click="() => addTag(t.name)">#{{ t.name }}</CtChip>
          </template>
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
        />
        <p aria-live="polite">{{ i18n.t(hasPin() ? "form.pinned" : mapsUrl.trim() ? "form.urlNoPin" : "form.unpinned") }}</p>
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
      <button type="submit" :disabled="!text.trim()">{{ i18n.t(saveLabel) }}</button>
      <p v-if="!editing">{{ i18n.t(hintKey) }}</p>
    </footer>
  </form>
</template>

<style scoped>
@import "../../ui/styles/media.css";

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

    > header h2 {
      margin: 0;
      padding-inline: 16px;
      font-size: var(--font-2xl);
      font-weight: 700;
    }
  }

  /* the app bar's height and edge, so the sheet lands where the bar was */
  &:not([data-docked]) > header {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 10px;
    box-sizing: content-box;
    height: var(--bar);
    padding: env(safe-area-inset-top, 0px) 12px 0;
    border-block-end: 1px solid var(--line);

    > button {
      min-height: var(--tap);
      padding: 0 12px 0 8px;
      border-radius: 999px;
      border: 1px solid var(--line);
      background: var(--surface);
      color: var(--muted);
      font-size: var(--font-sm);
      font-weight: 700;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }

    > h2 {
      margin: 0;
      font-size: var(--font-2xl);
      font-weight: 700;
    }

    > label {
      margin-inline-start: auto;
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

  > div {
    flex: 1;
    overflow-y: auto;
    padding: 16px var(--page-margin) 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;

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
    padding: 10px var(--page-margin) 16px;
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
  }
}
</style>
