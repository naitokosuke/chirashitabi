<script setup lang="ts" vapor>
import { computed } from "vue";

import { useI18n } from "../../i18n/useI18n";

import externalIcon from "../../icons/external.svg";
import Icon from "../../icons/Icon.vue";
import { useMembers } from "../members/useMembers";
import { imageSrc } from "../notes/image";
import { segments, siteOf } from "../notes/links";
import { PAPERS, type Note } from "../notes/types";
import { safeUrl } from "../place/google-maps";
import { useSync } from "../sync/useSync";
import type { Visibility } from "../tags/types";
import { hhmm, shortDate } from "../trip/format";

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
const clipping = computed(
  () => props.note.kind === "memo" && props.note.link !== null && props.note.image !== null,
);
/** "11/3 12:30", or the date alone when it has no time; nothing off the itinerary */
const day = computed(() => {
  const s = props.note.kind === "memo" ? props.note.schedule : null;
  if (s === null) return "";
  const date = shortDate(s.date, i18n.locale);
  return s.time === null ? date : `${date} ${hhmm(s.time)}`;
});
</script>

<template>
  <div
    v-show="visibility !== 'hidden'"
    :data-kind="note.kind"
    :data-link="(note.kind === 'memo' && note.link !== null) || undefined"
    :data-clipping="clipping || undefined"
    :data-dragging="dragging || undefined"
    :data-pop="pop || undefined"
    :data-selected="selected || undefined"
    :data-visibility="visibility"
    :style="
      `--x: ${note.x}px; --y: ${note.y}px; --rot: ${note.rot}deg; --scale: ${note.scale}; --card: ${PAPERS[note.color]}; --who: ${author?.color ?? 'var(--muted)'}`
    "
    :data-id="note.id"
    :tabindex="note.kind !== 'suggestion' && visibility !== 'dimmed' ? 0 : undefined"
    :role="note.kind !== 'suggestion' ? 'button' : undefined"
    :aria-label="note.kind === 'sticker'
      ? i18n.t('canvas.sticker')
      : note.kind !== 'suggestion'
        ? note.title
        : undefined"
  >
    <template v-if="note.kind === 'suggestion'">
      <header>
        <span aria-hidden="true"></span>
        {{ author?.name ?? i18n.t("member.someone") }}<small>{{ i18n.t("note.suggestion") }}</small>
      </header>
      <p>{{ note.title }}</p>
      <footer><button type="button" @click.stop="() => $emit('adopt')">{{
          i18n.t("note.adopt")
        }}</button><button type="button" @click.stop="() => $emit('remove')">{{
          i18n.t("common.dismiss")
        }}</button></footer>
    </template>
    <!-- words on the desk itself: no paper, no author's dot -->
    <p v-else-if="note.kind === 'text'">{{ note.title }}</p>
    <!-- a cut-out picture on the desk itself: edged in white, no paper -->
    <img
      v-else-if="note.kind === 'sticker'"
      alt=""
      draggable="false"
      :src="sync.room === null ? undefined : imageSrc(sync.room, note.image)"
    />
    <template v-else>
      <!-- the card's picture, across its top; the card is still what a finger holds -->
      <img
        v-if="note.image !== null"
        alt=""
        draggable="false"
        loading="lazy"
        :src="sync.room === null ? undefined : imageSrc(sync.room, note.image)"
      />
      <!--
        a clipping from a page: its site on the picture, which opens the page (the card under it
        still moves); with a picture the words stay in the note, the picture says it all
      -->
      <a
        v-if="safeUrl(note.link) !== undefined"
        :href="safeUrl(note.link)"
        rel="noopener noreferrer"
        target="_blank"
        :aria-label="i18n.t('note.link')"
        @pointerdown.stop
        @click.stop
      ><Icon :size="12" :src="externalIcon" />{{ siteOf(note.link) }}</a>
      <p v-if="!clipping">{{ note.title }}</p>
      <p v-if="!clipping && note.body !== ''"><template
          v-for="(s, i) in segments(note.body)"
          :key="i"
        ><a
            v-if="s.kind === 'link'"
            :href="s.url"
            rel="noopener noreferrer"
            target="_blank"
            @pointerdown.stop
            @click.stop
          >{{ s.url }}</a><template v-else>{{ s.text }}</template></template></p>
      <ul v-if="!clipping && note.tags.length > 0"><li v-for="t in note.tags" :key="t">#{{ t }}</li></ul>
      <!-- its day on the trip, once it has one: the desk shows how far the plan has come -->
      <time v-if="note.schedule !== null" :datetime="note.schedule.date.toString()">{{ day }}</time>
      <!-- a clipping's mount says who brought it in, by name, in the margin under the picture -->
      <small v-if="clipping"><span aria-hidden="true"></span>{{
          author?.name ?? i18n.t("member.someone")
        }}</small>
      <span></span>
    </template>
    <!-- picked: a handle above to turn it, one at the corner to resize it (the canvas drives both) -->
    <template v-if="selected">
      <span aria-hidden="true" data-handle="rotate"></span>
      <span aria-hidden="true" data-handle="resize"></span>
    </template>
  </div>
</template>

<style scoped>
@import "../../../ui/styles/media.css";

div {
  position: absolute;
  inset-inline-start: 0;
  inset-block-start: 0;
  width: 164px;
  padding: 12px;
  border-radius: 6px;
  background: var(--card, var(--paper-white));
  color: var(--paper-ink);
  box-shadow: var(--shadow-paper);
  /* the card's place and tilt live in variables so the pop can scale it where it lands */
  transform: translate(var(--x), var(--y)) rotate(var(--rot)) scale(var(--scale, 1));
  transform-origin: center;
  transition: opacity .2s, filter .2s;

  @media (--reduced-motion) {
    transition: none;
  }

  &[data-dragging] {
    box-shadow: var(--shadow-lift);
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

  /* the picture, edge to edge across the top; touches go to the card under it */
  > img {
    display: block;
    width: calc(100% + 24px);
    height: 110px;
    margin: -12px -12px 10px;
    object-fit: cover;
    border-radius: 6px 6px 0 0;
    background: color-mix(in oklch, var(--paper-ink) 6%, transparent);
    pointer-events: none;
  }

  /* a page's picture (a video's frame, a post's cover) is made for 16:9: shown whole at that, not cut to the band */
  &[data-link] > img {
    height: auto;
    aspect-ratio: 16 / 9;
  }

  /*
   * A clipping from a page, not a note: the paper is a narrow mount around the picture, edged
   * in the paper's own ink so it reads as something brought in from outside, and the site sits
   * on the picture with the arrow that means "elsewhere"
   */
  &[data-clipping] {
    /* a wide mount, wider still under the picture, where the margin says who brought it in */
    padding: 10px 10px 8px;
    border-radius: 4px;
    outline: 1.5px solid color-mix(in oklch, var(--paper-ink) 55%, transparent);
    outline-offset: -1.5px;

    > img {
      width: 100%;
      margin: 0;
      border-radius: 2px;
    }

    > a {
      position: absolute;
      inset-inline-start: 14px;
      inset-block-start: calc(10px + (100% - 20px) * 9 / 16 - 26px);
      inset-block-end: auto;
      margin: 0;
      background: color-mix(in oklch, var(--paper-ink) 72%, transparent);
      color: var(--paper-white);
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
    }

    /* the margin under the picture: who brought it in (their color, their name), and the day when it has one */
    > small {
      display: flex;
      align-items: center;
      gap: 5px;
      min-height: 16px;
      margin: 7px 0 0;
      font-size: var(--font-2xs);
      font-weight: 700;
      color: var(--paper-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;

      > span {
        flex-shrink: 0;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--who);
      }
    }

    > time {
      display: block;
      width: fit-content;
      margin: 4px 0 0;
    }

    /* the dot in the corner is said in the margin instead */
    > span:not([data-handle]) {
      display: none;
    }
  }

  /* the page's site, a small tag above the title, with the arrow that means "elsewhere" */
  > a {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    max-width: calc(100% - 18px);
    margin: 0 0 4px;
    padding: 2px 7px 2px 5px;
    border-radius: 999px;
    background: color-mix(in oklch, var(--paper-ink) 8%, transparent);
    color: var(--paper-muted);
    font-size: var(--font-2xs);
    font-weight: 700;
    text-decoration: none;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* the title */
  > p:first-of-type {
    margin: 0;
    font-size: var(--font-base);
    font-weight: 700;
    line-height: 1.4;
    word-break: break-word;
  }

  /* the body, under the title; a link in it is tapped, in the paper's ink */
  > p + p {
    margin: 4px 0 0;
    font-size: var(--font-xs);
    color: var(--paper-muted);
    overflow-wrap: anywhere;

    > a {
      color: var(--paper-ink);
      text-underline-offset: 2px;
    }
  }

  > ul {
    margin: 6px 0 0;
    padding: 0;
    list-style: none;
    font-size: var(--font-xs);
    font-weight: 700;
    color: var(--paper-muted);
    display: flex;
    flex-wrap: wrap;
    gap: 2px 8px;
  }

  /* its day, a small stamp under the tags */
  > time {
    display: inline-block;
    margin-block-start: 6px;
    padding: 1px 6px;
    border-radius: 999px;
    font-size: var(--font-xs);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    background: color-mix(in oklch, var(--paper-ink) 10%, transparent);
  }

  /* who wrote it (the handles are spans too, and come after) */
  > span:not([data-handle]) {
    position: absolute;
    inset-block-start: 8px;
    inset-inline-end: 8px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--who);
  }

  /* picked: framed in ink, lifted a little above the rest */
  &[data-selected] {
    z-index: var(--z-float);
    box-shadow:
      var(--shadow-float),
      0 0 0 2px var(--ink);
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
    background: transparent;
    box-shadow: none;
    color: var(--ink);

    &[data-dragging] {
      box-shadow: none;
    }

    &[data-selected] {
      box-shadow: 0 0 0 2px var(--ink);
    }

    > p {
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
    padding: 0;
    border-radius: 4px;
    background: transparent;
    box-shadow: none;

    &[data-dragging] {
      box-shadow: none;

      > img {
        filter: var(--sticker-edge) drop-shadow(0 8px 10px rgb(0 0 0 / .22));
      }
    }

    &[data-selected] {
      box-shadow: 0 0 0 2px var(--ink);
    }

    /* the whole picture, its own shape: none of a memo's picture band across the top */
    > img {
      width: 100%;
      height: auto;
      margin: 0;
      border-radius: 0;
      background: none;
      object-fit: contain;
      filter: var(--sticker-edge) drop-shadow(0 2px 3px rgb(0 0 0 / .2));
    }
  }

  /* a machine's note: plain white stock cut straight, with a dashed edge, never a person's soft corner */
  &[data-kind="suggestion"] {
    background: var(--paper-white);
    outline: 1px dashed color-mix(in oklch, var(--paper-ink) 30%, transparent);
    outline-offset: -5px;
    width: 186px;
    border-radius: 0;

    > header {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: var(--font-md);
      font-weight: 700;
      margin-block-end: 4px;

      /* who suggested it */
      > span {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--who);
      }

      > small {
        margin-inline-start: auto;
        font-size: var(--font-2xs);
        font-weight: 400;
        color: var(--paper-muted);
      }
    }

    > p {
      font-weight: 400;
      font-size: var(--font-sm);
    }

    > footer {
      display: flex;
      gap: 6px;
      margin-block-start: 8px;

      > button {
        min-height: var(--tap);
        padding: 0 12px;
        border-radius: 999px;
        font-size: var(--font-xs);
        font-weight: 700;

        /* adopt */
        &:first-child {
          background: var(--paper-ink);
          color: var(--paper-white);
        }

        /* dismiss */
        &:last-child {
          color: var(--paper-muted);
          box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--paper-ink) 18%, transparent);
        }
      }
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
