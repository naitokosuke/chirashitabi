<script setup lang="ts" vapor>
import { computed, nextTick, onBeforeUnmount, ref, useId, useTemplateRef, watch } from "vue";

import { CtButton, CtChip, CtChipInput, CtField, CtHint } from "../../../ui/index";

import { useI18n } from "../../i18n/useI18n";

import closeIcon from "../../icons/close.svg";
import Icon from "../../icons/Icon.vue";
import { useInRoom } from "../sync/InRoom.vue";
import { useOffline } from "../sync/useOffline";
import { FITS_AT, fits, likeness, rankTags, type TagOption } from "../tags/rank";
import { useTags } from "../tags/useTags";
import type { OverBudget } from "../worker/types";

import type { ImageId } from "./id";
import { normalizeTag, parseNoteText } from "./input";
import type { Tag } from "./types";
import { useAsk } from "./useAsk";

/**
 * A memo's tags: those added, the one being typed (`draft`), and a row of tags to add, those in
 * use and the trip's, in the order they fit the memo's words (`text`). Clef, asked by itself
 * once the words and the photo (`image`) settle, or with a tap at first, moves up what it finds
 * fitting.
 */
const props = defineProps<{ text: string; image: ImageId | null; tags: Tag[]; draft: string }>();
const emit = defineEmits<{ "update:tags": [tags: Tag[]]; "update:draft": [draft: string] }>();
/** The room's tags, those in use on its notes */
const inRoom = useTags();
const here = useInRoom();
const i18n = useI18n();
/** Cut off: what needs the Worker is not offered */
const cut = useOffline();
const id = useId();

function addTag(raw: string) {
  const t = normalizeTag(raw);
  if (t !== null && !props.tags.includes(t)) emit("update:tags", [...props.tags, t]);
}
function commitTag() {
  if (props.draft.trim() !== "") {
    addTag(props.draft);
    emit("update:draft", "");
  }
}
function removeTag(t: Tag) {
  emit(
    "update:tags",
    props.tags.filter((x) => x !== t),
  );
}

// ---- tags Clef finds fitting: asked by itself once the words settle, or with a tap at first ----
/** What Clef was last asked about for this memo, and how many times */
type Asked = { words: string; image: ImageId | null; asks: number };
/** What asking Clef is doing, or what came of it, with what it was asked about (none yet when idle) */
type Clef =
  | { kind: "idle"; asked: Asked | null }
  | { kind: "asking" | "none" | "failed" | OverBudget["ceiling"]; asked: Asked };
const clef = useAsk<Clef>({ kind: "idle", asked: null });
const TAG_STATE = {
  asking: "form.tagsAsking",
  none: "form.tagsNone",
  failed: "form.tagsFailed",
  day: "form.tagsLimit",
  trip: "form.tagsTripLimit",
} as const satisfies Record<Exclude<Clef["kind"], "idle">, string>;
const offered = ref<{ tag: Tag; p: number; isNew: boolean }[]>([]);
/**
 * In a room with no tags yet, the first ask has the agent propose the trip's tags too, so it
 * waits for a tap; after that Clef is asked by itself
 */
const askByTap = computed(() => inRoom.tagList.length === 0);
/** Each ask is one of the person's budgeted calls: Clef asks by itself at most this often a memo */
const MAX_ASKS = 2;
/** How long the words stay still before Clef is asked */
const SETTLE_MS = 1500;
/** Words less alike than this to those last asked about are a new memo to Clef (tags/rank.ts) */
const ASKED_ALIKE = 0.6;
async function askForTags(byTap: boolean) {
  if (clef.state.kind === "asking") return;
  const { title, body, tags: inline } = parseNoteText(props.text);
  const asked = {
    words: `${title}\n${body}`,
    image: props.image,
    asks: (clef.state.asked?.asks ?? 0) + 1,
  };
  // past the budget, or failed: Clef stops asking by itself for this memo
  const stopped = { ...asked, asks: MAX_ASKS };
  const turn = clef.ask({ kind: "asking", asked });
  try {
    const got = await here.api.suggestTags({
      title,
      body,
      image: props.image,
      chosen: [...props.tags, ...inline],
    });
    if (!turn.current()) return;
    if (!got.ok) {
      turn.settle({ kind: got.reason.ceiling, asked: stopped });
      return;
    }
    offered.value = got.value;
    // nothing fitting is worth saying only to the one who asked
    turn.settle({ kind: byTap && !got.value.some((t) => t.p >= FITS_AT) ? "none" : "idle", asked });
  } catch {
    turn.settle({ kind: "failed", asked: stopped });
  }
}
/** Asked once the words are there, then again only for a new photo or words much changed */
function worthAsking() {
  if (askByTap.value || props.text.trim() === "") return false;
  const { asked } = clef.state;
  if (asked === null) return true;
  if (asked.asks >= MAX_ASKS) return false;
  const { title, body } = parseNoteText(props.text);
  return props.image !== asked.image || likeness(`${title}\n${body}`, asked.words) < ASKED_ALIKE;
}
let settle: ReturnType<typeof setTimeout> | undefined;
function askOnceSettled() {
  if (worthAsking()) void askForTags(false);
}
watch([() => props.text, () => props.image], () => {
  clearTimeout(settle);
  // the words all taken back: what comes next is another memo, with its own asks; what Clef
  // made of the last one says nothing of it
  if (props.text.trim() === "" && clef.state.asked !== null) {
    clef.set({ kind: "idle", asked: null });
    offered.value = [];
  }
  settle = setTimeout(askOnceSettled, SETTLE_MS);
});
onBeforeUnmount(() => clearTimeout(settle));

// ---- the tags to add: those in use and the trip's, in the order they fit the words as typed ----
/** The trip's candidate tags the agent proposed; read for each room the form is in, free */
const candidates = ref<Tag[]>([]);
watch(
  () => here.api,
  async (api, _, onCleanup) => {
    // another room's Worker meanwhile: what this one answers is no longer the trip's
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
  const inUse = inRoom.tagList.map(({ name, count }) => ({
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
  const on = new Set([...props.tags, ...parseNoteText(props.text).tags]);
  return [...inUse, ...fresh].filter((o) => !on.has(o.name));
});
const ranked = computed(() => rankTags(options.value, props.text).slice(0, MAX_SHOWN));
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
</script>

<template>
  <CtField :for="`${id}-tag`" :label="i18n.t('form.tags')">
    <CtChipInput
      :id="`${id}-tag`"
      :model-value="draft"
      :placeholder="i18n.t('form.tagPlaceholder')"
      @commit="commitTag"
      @update:model-value="(d) => emit('update:draft', d)"
    >
      <CtChip v-for="t in tags" :key="t" selected size="sm" @click="() => removeTag(t)">#{{ t }} <Icon
          :size="12"
          :src="closeIcon"
        /></CtChip>
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
    <div v-if="askByTap || clef.state.kind !== 'idle'" class="suggested">
      <CtButton
        v-if="askByTap"
        variant="ask"
        :disabled="clef.state.kind === 'asking' || !text.trim() || cut.offline"
        :busy="clef.state.kind === 'asking'"
        @click="() => askForTags(true)"
      >{{ i18n.t("form.suggestTags") }}</CtButton>
      <CtHint v-if="clef.state.kind !== 'idle'" aria-live="polite">{{
        i18n.t(TAG_STATE[clef.state.kind])
      }}</CtHint>
      <CtHint v-else-if="askByTap && cut.offline">{{ i18n.t("offline.unavailable") }}</CtHint>
    </div>
  </CtField>
</template>

<style scoped>
/* the field (CtField) puts its gap between what it holds; the margins below are what goes past it */
.recent {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  margin-top: var(--space-1);
}

/* the ask for tags, then what came back */
.suggested {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
  margin-top: var(--space-1);

  > p {
    flex-basis: 100%;
  }
}
</style>
