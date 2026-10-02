<script lang="ts">
import type { Memo } from "../features/notes/types";
import type { LatLng } from "../features/place/types";

/** What the form is open on: a new memo (pinned when written from the map), or an existing one */
export type FormTarget = { kind: "new"; pin: LatLng | null } | { kind: "edit"; note: Memo };
</script>

<script setup lang="ts" vapor>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, useTemplateRef } from "vue";

import { CtChip } from "../../ui/index";

import { useI18n } from "../i18n/useI18n";

import {
  blankInput,
  inputFromNote,
  normalizeTag,
  noteText,
  parseNoteText,
} from "../features/notes/input";
import { COLOR_NAMES, COLORS, type NoteColor, type NoteInput } from "../features/notes/types";
import { useNotes } from "../features/notes/useNotes";
import { placeFromUrl } from "../features/place/google-maps";
import { useTags } from "../features/tags/useTags";
import backIcon from "../icons/back.svg";
import Icon from "../icons/Icon.vue";

const props = defineProps<{ target: FormTarget }>();
const emit = defineEmits<{ close: []; save: [input: NoteInput, keepOpen: boolean] }>();
const store = useNotes();
const tags = useTags();
const i18n = useI18n();
const id = useId();
const editing = computed(() => props.target.kind === "edit");

const form = ref<NoteInput>(
  props.target.kind === "edit"
    ? inputFromNote(props.target.note)
    : blankInput(tags.selected, props.target.pin),
);
const mapsUrl = ref(form.value.mapsUrl ?? "");
function onMapsUrl() {
  Object.assign(form.value, placeFromUrl(mapsUrl.value, form.value.pin));
}
const hasPin = () => form.value.pin !== null;
const text = ref(noteText(form.value));
const tagInput = ref("");
const keepOpen = ref(false);
const textEl = useTemplateRef<HTMLTextAreaElement>("textEl");
onMounted(() => nextTick(() => textEl.value?.focus()));

// Esc closes the sheet, the way it closes anything that covers something
function onKey(e: KeyboardEvent) {
  if (e.key === "Escape") emit("close");
}
onMounted(() => window.addEventListener("keydown", onKey));
onBeforeUnmount(() => window.removeEventListener("keydown", onKey));

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
  emit("save", input, keepOpen.value);
  if (keepOpen.value) {
    text.value = "";
    nextTick(() => textEl.value?.focus());
  }
}
</script>

<template>
  <form class="formview" @submit.prevent="submit">
    <div class="head">
      <button class="back" type="button" @click="() => emit('close')">
        <Icon :size="16" :src="backIcon" />{{ i18n.t("nav.canvas") }}
      </button>
      <h2>{{ i18n.t(editing ? "form.titleEdit" : "form.titleNew") }}</h2>
      <label v-if="!editing"><input v-model="keepOpen" type="checkbox" />{{ i18n.t("form.addAnother") }}</label>
    </div>
    <div class="body">
      <div>
        <label class="l" :for="`${id}-text`">{{ i18n.t("form.note") }}</label>
        <textarea
          :id="`${id}-text`"
          ref="textEl"
          v-model="text"
          rows="4"
          :placeholder="i18n.t('form.notePlaceholder')"
        ></textarea>
      </div>
      <div>
        <label class="l" :for="`${id}-tag`">{{ i18n.t("form.tags") }}</label>
        <div class="tagbox">
          <CtChip
            v-for="t in form.tags"
            :key="t"
            class="chip"
            selected
            :color="tags.tagColor(t)"
            @click="() => removeTag(t)"
          >#{{ t }} ×</CtChip>
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
            <CtChip v-if="!form.tags.includes(t.name)" :color="t.color" @click="() => addTag(t.name)">#{{ t.name }}</CtChip>
          </template>
        </div>
      </div>
      <div>
        <label class="l" :for="`${id}-maps`">{{ i18n.t("form.place") }}</label>
        <input
          :id="`${id}-maps`"
          v-model="mapsUrl"
          class="url"
          inputmode="url"
          type="url"
          :placeholder="i18n.t('form.mapsPlaceholder')"
          @change="onMapsUrl"
        />
        <p aria-live="polite" class="pinstate">{{ i18n.t(hasPin() ? "form.pinned" : mapsUrl.trim() ? "form.urlNoPin" : "form.unpinned") }}</p>
      </div>
      <div>
        <span :id="`${id}-color`" class="l">{{ i18n.t("form.color") }}</span>
        <div class="colors" role="group" :aria-labelledby="`${id}-color`">
          <button
            v-for="c in COLORS"
            :key="c"
            type="button"
            :class="{ on: form.color === c }"
            :style="`background:${c}`"
            :aria-label="i18n.t(COLOR_NAMES[c])"
            :aria-pressed="form.color === c"
            @click="() => setColor(c)"
          ></button>
        </div>
      </div>
    </div>
    <div class="foot">
      <button class="save" type="submit" :disabled="!text.trim()">{{ i18n.t(editing ? "form.save" : "form.saveToCanvas") }}</button>
      <p v-if="!editing" class="hint">{{ i18n.t("form.hint") }}</p>
    </div>
  </form>
</template>

<style scoped>
.formview {
  position: absolute;
  inset: 0;
  z-index: var(--z-sheet);
  background: var(--bg);
  display: flex;
  flex-direction: column;
}

.head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: calc(10px + env(safe-area-inset-top, 0px)) 12px 8px;
  & h2 {
    margin: 0;
    font-size: var(--font-3xl);
    font-weight: 900;
  }
  & label {
    margin-inline-start: auto;
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: var(--tap);
    font-size: var(--font-sm);
    color: var(--muted);
    & input {
      width: 20px;
      height: 20px;
      margin: 0;
      accent-color: var(--ink);
    }
  }
}

.back {
  min-height: 40px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1.5px solid var(--line);
  background: var(--surface);
  font-size: var(--font-sm);
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.body {
  flex: 1;
  overflow-y: auto;
  padding: 4px 20px 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.l {
  font-size: var(--font-sm);
  font-weight: 700;
  color: var(--muted);
  display: block;
  margin-bottom: 6px;
}

textarea {
  width: 100%;
  font: inherit;
  font-size: var(--font-xl);
  padding: 12px;
  border: 1.5px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
  color: var(--ink);
  resize: none;
  min-height: 120px;
}

.url {
  width: 100%;
  font: inherit;
  font-size: var(--font-base);
  padding: 10px 12px;
  border: 1.5px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
  color: var(--ink);
}

.pinstate {
  margin: 6px 0 0;
  font-size: var(--font-xs);
  color: var(--muted);
}

.tagbox {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  min-height: 46px;
  padding: 6px 8px;
  border: 1.5px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
  /* the box is the field: it takes the focus ring for the input inside it */
  &:focus-within {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
  }
  & input {
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
  & .chip {
    min-height: 32px;
  }
}

.recent {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.colors {
  display: flex;
  gap: 10px;
  & button {
    width: var(--tap);
    height: var(--tap);
    border-radius: 50%;
    border: 3px solid transparent;
    box-shadow: var(--shadow-tool);
    &.on {
      border-color: var(--ink);
    }
  }
}

.foot {
  padding: 10px 20px 16px;
  border-top: 1.5px solid var(--line);
  background: var(--bg);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.save {
  height: 52px;
  border-radius: 999px;
  background: var(--red);
  color: var(--on-accent);
  font-size: var(--font-xl);
  font-weight: 700;
}

.save:disabled {
  opacity: .4;
}

@media (hover: hover) {
  .save:not(:disabled):hover {
    box-shadow: 0 6px 16px rgba(215,38,61,.35);
  }
}

.hint {
  margin: 0;
  text-align: center;
  font-size: var(--font-xs);
  color: var(--muted);
}
</style>
