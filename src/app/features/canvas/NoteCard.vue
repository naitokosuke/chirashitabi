<script setup lang="ts" vapor>
import { computed } from "vue";

import { CtPaper } from "../../../ui/index";

import { useI18n } from "../../i18n/useI18n";

import externalIcon from "../../icons/external.svg";
import Icon from "../../icons/Icon.vue";
import { useMembers } from "../members/useMembers";
import type { ImageId } from "../notes/id";
import { imageSrc } from "../notes/image";
import { segments, siteOf } from "../notes/links";
import { PAPERS, type Note } from "../notes/types";
import { safeUrl } from "../place/google-maps";
import { useSync } from "../sync/useSync";
import type { Visibility } from "../tags/types";
import { hhmm, shortDate } from "../trip/format";

/**
 * A card on the desk, placed, turned and scaled where the note says. Paper (a memo, the
 * agent's suggestion, a page's picture) is drawn by CtPaper in one of its cuts; words written
 * on the desk and a sticker are not paper and draw themselves.
 */
const props = defineProps<{
  note: Note;
  dragging: boolean;
  pop: boolean;
  visibility: Visibility;
  /** Picked on the desk: framed, with handles to resize and to turn it */
  selected: boolean;
}>();
defineEmits<{ adopt: []; remove: [] }>();
const { members } = useMembers();
/** Whose card it is; nobody once they have left the room */
const author = computed(() => members.value?.find((m) => m.id === props.note.by));
const sync = useSync();
const i18n = useI18n();
/** A page's picture with its link: the picture is the card, the words stay in the note */
const print = computed(
  () => props.note.kind === "memo" && props.note.link !== null && props.note.image !== null,
);
/** "11/3 12:30", or the date alone when it has no time; nothing off the itinerary */
const day = computed(() => {
  const s = props.note.kind === "memo" ? props.note.schedule : null;
  if (s === null) return "";
  const date = shortDate(s.date, i18n.locale);
  return s.time === null ? date : `${date} ${hhmm(s.time)}`;
});
/** Where a picture of the room is shown from, once the room is known */
const picture = (id: ImageId) => (sync.room === null ? undefined : imageSrc(sync.room, id));
</script>

<template>
  <div
    v-show="visibility !== 'hidden'"
    class="card"
    :data-kind="note.kind"
    :data-dragging="dragging || undefined"
    :data-pop="pop || undefined"
    :data-selected="selected || undefined"
    :data-visibility="visibility"
    :style="`--x: ${note.x}px; --y: ${note.y}px; --rot: ${note.rot}deg; --scale: ${note.scale}`"
    :data-id="note.id"
    :tabindex="note.kind !== 'suggestion' && visibility !== 'dimmed' ? 0 : undefined"
    :role="note.kind !== 'suggestion' ? 'button' : undefined"
    :aria-label="note.kind === 'sticker'
      ? i18n.t('canvas.sticker')
      : note.kind !== 'suggestion'
        ? note.title
        : undefined"
  >
    <!-- a slip from the agent: who proposed it in the strip, the proposal, what to do with it -->
    <CtPaper
      v-if="note.kind === 'suggestion'"
      variant="proposal"
      :lifted="dragging"
      :selected
      :who="author?.color"
    >
      <template #strip>{{ author?.name ?? i18n.t("member.someone") }} · {{ i18n.t("note.suggestion") }}</template>
      <p class="title">{{ note.title }}</p>
      <template #foot>
        <button class="keep" type="button" @click.stop="() => $emit('adopt')">{{
          i18n.t("note.adopt")
        }}</button>
        <button type="button" @click.stop="() => $emit('remove')">{{
          i18n.t("common.dismiss")
        }}</button>
      </template>
    </CtPaper>
    <!-- words on the desk itself: no paper -->
    <p v-else-if="note.kind === 'text'">{{ note.title }}</p>
    <!-- a cut-out picture on the desk itself: edged in white, no paper -->
    <img v-else-if="note.kind === 'sticker'" alt="" draggable="false" :src="picture(note.image)" />
    <!-- a page brought in: its picture in a mount, the site in the margin, which opens the page -->
    <CtPaper
      v-else-if="print"
      variant="print"
      :lifted="dragging"
      :paper="PAPERS[note.color]"
      :selected
      :who="author?.color"
    >
      <template #picture>
        <img
          alt=""
          class="shot"
          draggable="false"
          loading="lazy"
          :src="note.image === null ? undefined : picture(note.image)"
        />
      </template>
      <template #margin>
        <a
          class="from"
          :href="safeUrl(note.link)"
          rel="noopener noreferrer"
          target="_blank"
          :aria-label="i18n.t('note.link')"
          @pointerdown.stop
          @click.stop
        ><Icon :size="11" :src="externalIcon" />{{ siteOf(note.link) }}</a>
        <time v-if="note.schedule !== null" class="when" :datetime="note.schedule.date.toString()">{{
          day
        }}</time>
      </template>
    </CtPaper>
    <!-- a sticky: the picture across the top when it has one, the words, the tags, the day -->
    <CtPaper v-else :lifted="dragging" :paper="PAPERS[note.color]" :selected :who="author?.color">
      <img
        v-if="note.image !== null"
        alt=""
        class="band"
        draggable="false"
        loading="lazy"
        :src="picture(note.image)"
      />
      <!-- where the idea came from, when the page gave no picture: its site, which opens the page -->
      <a
        v-if="safeUrl(note.link) !== undefined"
        class="site"
        :href="safeUrl(note.link)"
        rel="noopener noreferrer"
        target="_blank"
        :aria-label="i18n.t('note.link')"
        @pointerdown.stop
        @click.stop
      ><Icon :size="11" :src="externalIcon" />{{ siteOf(note.link) }}</a>
      <p class="title">{{ note.title }}</p>
      <!-- the words, a few lines of them; a link in them is its site, tapped -->
      <p v-if="note.body !== ''" class="body"><template
          v-for="(s, i) in segments(note.body)"
          :key="i"
        ><a
            v-if="s.kind === 'link'"
            :href="s.url"
            rel="noopener noreferrer"
            target="_blank"
            @pointerdown.stop
            @click.stop
          ><Icon :size="11" :src="externalIcon" />{{ siteOf(s.url) }}</a><template v-else>{{
            s.text
          }}</template></template></p>
      <ul v-if="note.tags.length > 0"><li v-for="t in note.tags" :key="t">#{{ t }}</li></ul>
      <template #foot>
        <!-- its day on the trip, once it has one: the desk shows how far the plan has come -->
        <time v-if="note.schedule !== null" :datetime="note.schedule.date.toString()">{{
          day
        }}</time>
      </template>
    </CtPaper>
    <!-- picked: a handle above to turn it, one at the corner to resize it (the canvas drives both) -->
    <template v-if="selected">
      <span aria-hidden="true" data-handle="rotate"></span>
      <span aria-hidden="true" data-handle="resize"></span>
    </template>
  </div>
</template>

<style scoped>
@import "../../../ui/styles/media.css";

/* the root is .card: CtPaper's own root carries this component's scope too, and a bare div rule would reach it */
.card {
  position: absolute;
  inset-inline-start: 0;
  inset-block-start: 0;
  width: 164px;
  /* the card's place and tilt live in variables so the pop can scale it where it lands */
  transform: translate(var(--x), var(--y)) rotate(var(--rot)) scale(var(--scale, 1));
  transform-origin: center;
  transition: opacity .2s, filter .2s;

  @media (--reduced-motion) {
    transition: none;
  }

  &[data-dragging] {
    z-index: var(--z-drag);
    will-change: transform;
    transition: none;
  }

  &[data-visibility="dimmed"] {
    opacity: .22;
    filter: saturate(.2);
    pointer-events: none;
  }

  &[data-pop] {
    animation: pop .5s cubic-bezier(.2,1.4,.4,1) both;

    @media (--reduced-motion) {
      animation: none;
    }
  }

  &[data-selected] {
    z-index: var(--z-float);
  }

  /* ---- what is written on paper: one type scale for a sticky and a slip alike ---- */

  /* the picture, edge to edge across the top, under the strip; touches go to the card under it */
  .band {
    display: block;
    width: calc(100% + 24px);
    height: 100px;
    margin: -9px -12px 10px;
    object-fit: cover;
    background: color-mix(in oklch, var(--paper-ink) 6%, transparent);
    pointer-events: none;
  }

  /* the title: three lines at most on the desk, the rest in the note */
  .title {
    margin: 0;
    font-size: var(--font-base);
    font-weight: 700;
    line-height: 1.35;
    overflow-wrap: anywhere;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  /* the body, under the title: three lines at most; a link in it is its site, as a small tag */
  .body {
    margin: 4px 0 0;
    font-size: var(--font-xs);
    line-height: 1.45;
    color: var(--paper-muted);
    overflow-wrap: anywhere;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;

    > a {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      vertical-align: bottom;
      padding: 0 5px 0 3px;
      border-radius: 999px;
      background: color-mix(in oklch, var(--paper-ink) 8%, transparent);
      color: var(--paper-ink);
      font-weight: 700;
      text-decoration: none;
    }
  }

  /* the page's site above the title, when the page gave no picture to be the card */
  .site {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    max-width: 100%;
    margin: 0 0 5px;
    padding: 2px 7px 2px 5px;
    border-radius: 999px;
    background: color-mix(in oklch, var(--paper-ink) 8%, transparent);
    color: var(--paper-muted);
    font-size: var(--font-2xs);
    font-weight: 700;
    line-height: 1.2;
    text-decoration: none;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* the tags, on one line */
  ul {
    margin: 6px 0 0;
    padding: 0;
    list-style: none;
    font-size: var(--font-xs);
    font-weight: 700;
    line-height: 1.3;
    color: var(--paper-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;

    > li {
      display: inline;

      & + li {
        margin-inline-start: 7px;
      }
    }
  }

  /* the foot: a day as a small stamp, or a slip's two actions, of one height */
  time,
  .keep,
  .keep + button {
    min-height: 26px;
    margin-block-start: 8px;
    padding: 0 9px;
    border-radius: 999px;
    font-size: var(--font-xs);
    font-weight: 700;
    line-height: 26px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  time {
    display: inline-block;
    background: color-mix(in oklch, var(--paper-ink) 10%, transparent);
  }

  /* the two actions: keeping it takes the room, and is never cut; dismissing it only what its word needs */
  .keep {
    flex: 1 1 auto;
    min-width: fit-content;
    padding: 0 8px;
  }

  /* dismissing is a word, not a button: the same quiet text as taking a day off a note */
  .keep + button {
    flex: 0 0 auto;
    padding: 0 2px;
  }

  /* a proposal is a sentence: it may run longer than a sticky's title */
  &[data-kind="suggestion"] .title {
    -webkit-line-clamp: 5;
  }

  .keep {
    background: var(--paper-ink);
    color: var(--paper-white);
  }

  .keep + button {
    color: var(--paper-muted);
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  /* ---- a print: the picture, and the margin's caption ---- */
  .shot {
    display: block;
    width: 100%;
    aspect-ratio: 16 / 9;
    object-fit: cover;
    pointer-events: none;
  }

  .from {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    min-width: 0;
    color: var(--paper-ink);
    text-decoration: none;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* in the margin the day is written, not stamped, at the end */
  .when {
    min-height: 0;
    margin: 0 0 0 auto;
    padding: 0;
    line-height: 1;
    background: none;
    color: var(--paper-muted);
  }

  /*
   * The handles: a thumb-sized target with a small dot in it, the same size on screen whatever
   * the card's scale and the desk's zoom (both undone by their own scale)
   */
  > span[data-handle] {
    position: absolute;
    width: var(--tap);
    height: var(--tap);
    display: grid;
    place-items: center;
    scale: calc(1 / (var(--scale, 1) * var(--zoom, 1)));
    touch-action: none;

    &::before {
      content: "";
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: var(--surface);
      box-shadow:
        0 0 0 2px var(--ink),
        var(--shadow-tool);
    }

    /* at the bottom-end corner: dragged away from the middle, the card grows */
    &[data-handle="resize"] {
      inset-block-end: calc(var(--tap) / -2);
      inset-inline-end: calc(var(--tap) / -2);
      cursor: nwse-resize;
    }

    /* above the middle of the top edge: dragged around the middle, the card turns */
    &[data-handle="rotate"] {
      inset-block-start: calc(var(--tap) * -1.4);
      inset-inline-start: calc(50% - var(--tap) / 2);
      cursor: grab;
    }
  }

  /*
   * A text box: the desk's own lettering, no paper and no shadow, in the desk's ink so it reads
   * in either theme, as wide as its longest line up to a point. Picked, it is framed like a card.
   */
  &[data-kind="text"] {
    width: max-content;
    max-width: 560px;
    padding: var(--text-box-pad);
    border-radius: 4px;
    color: var(--ink);

    &[data-selected] {
      box-shadow: 0 0 0 2px var(--ink);
    }

    > p {
      margin: 0;
      font-size: var(--text-box-size);
      font-weight: 700;
      line-height: 1.3;
      letter-spacing: 0.02em;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
  }

  /*
   * A sticker: the picture alone, its outline traced in white like a die-cut sticker and lifted
   * off the desk by a soft shadow that follows the cut. Picked, it is framed like a card.
   */
  &[data-kind="sticker"] {
    width: var(--sticker-size);
    border-radius: 4px;

    &[data-dragging] > img {
      filter: var(--sticker-edge) drop-shadow(0 8px 10px rgb(0 0 0 / .22));
    }

    &[data-selected] {
      box-shadow: 0 0 0 2px var(--ink);
    }

    > img {
      display: block;
      width: 100%;
      height: auto;
      object-fit: contain;
      filter: var(--sticker-edge) drop-shadow(0 2px 3px rgb(0 0 0 / .2));
    }
  }
}

/* every frame keeps the card's translate, so it pops where it lands and never at the origin */
@keyframes pop {
  0% {
    transform: translate(var(--x), var(--y)) rotate(calc(var(--rot) - 8deg)) scale(calc(var(--scale, 1) * .3));
    opacity: 0
  }
  60% {
    transform: translate(var(--x), var(--y)) rotate(calc(var(--rot) + 1deg)) scale(calc(var(--scale, 1) * 1.08));
    opacity: 1
  }
  100% {
    transform: translate(var(--x), var(--y)) rotate(var(--rot)) scale(var(--scale, 1))
  }
}
</style>
