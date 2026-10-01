<script setup lang="ts" vapor>
import { nextTick, onMounted, ref, useId, useTemplateRef } from "vue";
import { useNotes } from "@/notes/store";
import type { Note, NoteInput } from "@/notes/types";
import { parseMapsUrl } from "@/map/google-maps";

const props = defineProps<{ editing: Note | null; at?: { lat: number; lng: number } | null }>();
const emit = defineEmits<{ close: []; save: [input: NoteInput, keepOpen: boolean] }>();
const store = useNotes();
const id = useId();

const form = ref<NoteInput>(
  props.editing
    ? {
        title: props.editing.title,
        body: props.editing.body,
        tags: [...props.editing.tags],
        color: props.editing.color,
        mapsUrl: props.editing.mapsUrl,
        lat: props.editing.lat,
        lng: props.editing.lng,
      }
    : {
        title: "",
        body: "",
        tags: [...store.selected],
        color: store.COLORS[0],
        lat: props.at?.lat,
        lng: props.at?.lng,
      },
);
const mapsUrl = ref(form.value.mapsUrl ?? "");
function onMapsUrl() {
  form.value.mapsUrl = mapsUrl.value.trim() || undefined;
  const c = form.value.mapsUrl ? parseMapsUrl(form.value.mapsUrl) : null;
  if (c) {
    form.value.lat = c.lat;
    form.value.lng = c.lng;
  }
}
const hasPin = () => form.value.lat != null && form.value.lng != null;
const text = ref([form.value.title, form.value.body].filter(Boolean).join("\n"));
const tagInput = ref("");
const keepOpen = ref(false);
const textEl = useTemplateRef<HTMLTextAreaElement>("textEl");
onMounted(() => nextTick(() => textEl.value?.focus()));

function addTag(t: string) {
  t = t.replace(/^#/, "").trim();
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
function setColor(c: string) {
  form.value.color = c;
}

function submit() {
  commitTag();
  const [first, ...rest] = text.value.trim().split("\n");
  const inline = [...text.value.matchAll(/#([^\s#]+)/g)].map((m) => m[1]);
  const title = first.replace(/#[^\s#]+/g, "").trim() || first;
  onMapsUrl();
  const input: NoteInput = {
    title,
    body: rest.join("\n"),
    tags: [...new Set([...form.value.tags, ...inline])],
    color: form.value.color,
    mapsUrl: form.value.mapsUrl,
    lat: form.value.lat,
    lng: form.value.lng,
  };
  if (props.editing) {
    store.update(props.editing.id, input);
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
        <svg
          fill="none"
          height="16"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2.5"
          viewBox="0 0 24 24"
          width="16"
        ><path d="M15 5l-7 7 7 7" /></svg>Canvas
      </button>
      <h2>{{ editing ? "Edit note" : "New note" }}</h2>
      <label v-if="!editing"><input v-model="keepOpen" type="checkbox" />Add another</label>
    </div>
    <div class="body">
      <div>
        <label class="l" :for="`${id}-text`">Note</label>
        <textarea
          :id="`${id}-text`"
          ref="textEl"
          v-model="text"
          placeholder="Places to go, food to try, anything that comes to mind"
          rows="4"
        ></textarea>
      </div>
      <div>
        <label class="l" :for="`${id}-tag`">Tags</label>
        <div class="tagbox">
          <button
            v-for="t in form.tags"
            :key="t"
            class="chip on"
            type="button"
            :style="`--tag:${store.tagColor(t)}`"
            @click="() => removeTag(t)"
          >#{{ t }} ×</button>
          <input
            :id="`${id}-tag`"
            v-model="tagInput"
            enterkeyhint="done"
            placeholder="Add a tag…"
            @keydown.enter.prevent="commitTag"
            @blur="commitTag"
          />
        </div>
        <div class="recent">
          <template v-for="t in store.tagList.slice(0, 8)" :key="t.name">
            <button
              v-if="!form.tags.includes(t.name)"
              class="chip"
              type="button"
              :style="`--tag:${t.color}`"
              @click="() => addTag(t.name)"
            >#{{ t.name }}</button>
          </template>
        </div>
      </div>
      <div>
        <label class="l" :for="`${id}-maps`">Place</label>
        <input
          :id="`${id}-maps`"
          v-model="mapsUrl"
          class="url"
          inputmode="url"
          placeholder="Paste a Google Maps link"
          type="url"
          @change="onMapsUrl"
        />
        <p class="pinstate">{{
            hasPin()
              ? "This drops a pin on the map"
              : "No coordinates? Long-press on the map view to place it"
          }}</p>
      </div>
      <div>
        <span :id="`${id}-color`" class="l">Color</span>
        <div class="colors" role="group" :aria-labelledby="`${id}-color`">
          <button
            v-for="c in store.COLORS"
            :key="c"
            type="button"
            :class="{ on: form.color === c }"
            :style="`background:${c}`"
            :aria-label="c"
            @click="() => setColor(c)"
          ></button>
        </div>
      </div>
    </div>
    <div class="foot">
      <button class="save" type="submit" :disabled="!text.trim()">{{ editing ? "Save" : "Save to canvas" }}</button>
      <p v-if="!editing" class="hint">It pops up in the middle of where you were looking on the canvas</p>
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
    gap: 6px;
    font-size: var(--font-sm);
    color: var(--muted);
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
  border-radius: 12px;
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
  border-radius: 12px;
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
  border-radius: 12px;
  background: var(--surface);
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
    width: 34px;
    height: 34px;
    border-radius: 50%;
    border: 3px solid transparent;
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

.hint {
  margin: 0;
  text-align: center;
  font-size: var(--font-xs);
  color: var(--muted);
}
</style>
