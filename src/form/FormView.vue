<script setup lang="ts" vapor>
import { nextTick, onMounted, reactive, ref, useTemplateRef } from "vue";
import { useNotes } from "@/notes/store";
import type { Note, NoteInput } from "@/notes/types";
import { parseMapsUrl } from "@/map/google-maps";

const props = defineProps<{ editing: Note | null; at?: { lat: number; lng: number } | null }>();
const emit = defineEmits<{ close: []; save: [input: NoteInput, keepOpen: boolean] }>();
const store = useNotes();

const form = reactive<NoteInput>(
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
const mapsUrl = ref(form.mapsUrl ?? "");
function onMapsUrl() {
  form.mapsUrl = mapsUrl.value.trim() || undefined;
  const c = form.mapsUrl ? parseMapsUrl(form.mapsUrl) : null;
  if (c) {
    form.lat = c.lat;
    form.lng = c.lng;
  }
}
const hasPin = () => form.lat != null && form.lng != null;
const text = ref([form.title, form.body].filter(Boolean).join("\n"));
const tagInput = ref("");
const keepOpen = ref(false);
const textEl = useTemplateRef<HTMLTextAreaElement>("textEl");
onMounted(() => nextTick(() => textEl.value?.focus()));

function addTag(t: string) {
  t = t.replace(/^#/, "").trim();
  if (t && !form.tags.includes(t)) form.tags.push(t);
}
function commitTag() {
  if (tagInput.value.trim()) {
    addTag(tagInput.value);
    tagInput.value = "";
  }
}
function removeTag(t: string) {
  form.tags.splice(form.tags.indexOf(t), 1);
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
    tags: [...new Set([...form.tags, ...inline])],
    color: form.color,
    mapsUrl: form.mapsUrl,
    lat: form.lat,
    lng: form.lng,
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
      <button class="back" type="button" @click="emit('close')">
        <svg
          fill="none"
          height="16"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2.5"
          viewBox="0 0 24 24"
          width="16"
        ><path d="M15 5l-7 7 7 7" /></svg>キャンバス
      </button>
      <h2>{{ editing ? "メモを編集" : "メモを追加" }}</h2>
      <label v-if="!editing"><input type="checkbox" v-model="keepOpen">続けて追加</label>
    </div>
    <div class="body">
      <div>
        <label class="l" for="f-text">メモ</label>
        <textarea
          id="f-text"
          ref="textEl"
          rows="4"
          v-model="text"
          placeholder="行きたい場所、食べたいもの、思いついたこと"
        ></textarea>
      </div>
      <div>
        <label class="l" for="f-tag">タグ</label>
        <div class="tagbox">
          <button
            v-for="t in form.tags"
            :key="t"
            class="chip on"
            type="button"
            :style="`--tag:${store.tagColor(t)}`"
            @click="removeTag(t)"
          >#{{ t }} ×</button>
          <input
            id="f-tag"
            v-model="tagInput"
            enterkeyhint="done"
            placeholder="タグを入力…"
            @keydown.enter.prevent="commitTag"
            @blur="commitTag"
          >
        </div>
        <div class="recent">
          <template v-for="t in store.tagList.slice(0, 8)" :key="t.name">
            <button
              v-if="!form.tags.includes(t.name)"
              class="chip"
              type="button"
              :style="`--tag:${t.color}`"
              @click="addTag(t.name)"
            >#{{ t.name }}</button>
          </template>
        </div>
      </div>
      <div>
        <label class="l" for="f-maps">場所</label>
        <input
          id="f-maps"
          class="url"
          type="url"
          v-model="mapsUrl"
          inputmode="url"
          placeholder="Google マップのリンクを貼る"
          @change="onMapsUrl"
        >
        <p class="pinstate">{{ hasPin() ? "地図にピンが立ちます" : "座標が取れないときは地図ビューで長押しして置けます" }}</p>
      </div>
      <div>
        <label class="l">色</label>
        <div class="colors">
          <button
            v-for="c in store.COLORS"
            :key="c"
            type="button"
            :class="{ on: form.color === c }"
            :style="`background:${c}`"
            :aria-label="c"
            @click="form.color = c"
          ></button>
        </div>
      </div>
    </div>
    <div class="foot">
      <button class="save" type="submit" :disabled="!text.trim()">{{ editing ? "保存する" : "保存してキャンバスに置く" }}</button>
      <p v-if="!editing" class="hint">キャンバスに戻って、見ていた場所の真ん中にポンと出ます</p>
    </div>
  </form>
</template>

<style scoped>
.formview {
  position: absolute;
  inset: 0;
  z-index: 20;
  background: var(--bg);
  display: flex;
  flex-direction: column;
}

.head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: calc(10px + env(safe-area-inset-top, 0px)) 12px 8px;
}

.head h2 {
  margin: 0;
  font-size: 19px;
  font-weight: 900;
}

.back {
  min-height: 40px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1.5px solid var(--line);
  background: var(--surface);
  font-size: 13px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.head label {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--muted);
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
  font-size: 13px;
  font-weight: 700;
  color: var(--muted);
  display: block;
  margin-bottom: 6px;
}

textarea {
  width: 100%;
  font: inherit;
  font-size: 17px;
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
  font-size: 15px;
  padding: 10px 12px;
  border: 1.5px solid var(--line);
  border-radius: 12px;
  background: var(--surface);
  color: var(--ink);
}

.pinstate {
  margin: 6px 0 0;
  font-size: 12px;
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
}

.tagbox input {
  flex: 1;
  min-width: 80px;
  border: 0;
  background: transparent;
  font: inherit;
  font-size: 15px;
  color: var(--ink);
  height: 32px;
  outline: none;
}

.tagbox .chip {
  min-height: 32px;
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
}

.colors button {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 3px solid transparent;
}

.colors button.on {
  border-color: var(--ink);
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
  color: #fff;
  font-size: 17px;
  font-weight: 700;
}

.save:disabled {
  opacity: .4;
}

.hint {
  margin: 0;
  text-align: center;
  font-size: 12px;
  color: var(--muted);
}
</style>
