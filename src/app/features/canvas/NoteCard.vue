<script setup lang="ts" vapor>
import { computed, useId } from "vue";

import { CtBadge, CtHoldButton, CtPaper, safeUrl } from "../../../ui/index";

import { useI18n } from "../../i18n/useI18n";

import externalIcon from "../../icons/external.svg";
import Icon from "../../icons/Icon.vue";
import thumbsDownIcon from "../../icons/thumbs-down.svg";
import thumbsUpIcon from "../../icons/thumbs-up.svg";
import { paperOf } from "../members/paper";
import { useMembers } from "../members/useMembers";
import type { ImageId } from "../notes/id";
import { imageSrc } from "../notes/image";
import { segments, siteOf } from "../notes/links";
import type { Note } from "../notes/types";
import { useSync } from "../sync/useSync";
import type { Visibility } from "../tags/types";
import { hhmm, shortDate } from "../trip/format";

/**
 * A card on the desk, placed, turned and scaled where the note says. Paper (a memo, the
 * agent's suggestion) is drawn by CtPaper in the paper of whoever wrote it, cut by what it is;
 * words written on the desk and a sticker are not paper and draw themselves.
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
/** Whose paper it is written on: theirs, or white once they have left the room */
const paper = computed(() => paperOf(members.value?.find((m) => m.id === props.note.by)?.color));
const sync = useSync();
const i18n = useI18n();
const id = useId();
/** A memo with a picture is a print: the picture mounted, its words under it */
const print = computed(() => props.note.kind === "memo" && props.note.image !== null);
/** "11/3 12:30", or the date alone when it has no time; nothing off the itinerary */
const day = computed(() => {
  const s = props.note.kind === "memo" ? props.note.schedule : null;
  if (s === null) return "";
  const date = shortDate(s.date, i18n.locale);
  return s.time === null ? date : `${date} ${hhmm(s.time)}`;
});
/** Where a picture of the room is shown from, once the room is known */
const picture = (id: ImageId) => (sync.room === null ? undefined : imageSrc(sync.room, id));
/** How long a slip's answer is held: long enough not to be brushed, short enough to be a flick */
const HOLD_MS = 600;
</script>

<template>
  <div
    v-show="visibility !== 'hidden'"
    class="card"
    :class="[`kind-${note.kind}`, `visibility-${visibility}`, { print, dragging, pop, selected }]"
    :style="`--x: ${note.x}px; --y: ${note.y}px; --rot: ${note.rot}deg; --scale: ${note.scale}`"
    :data-id="note.id"
    :tabindex="
      (note.kind === 'text' || note.kind === 'sticker') && visibility !== 'dimmed' ? 0 : undefined
    "
    :role="note.kind === 'text' || note.kind === 'sticker' ? 'button' : 'group'"
    :aria-label="note.kind === 'sticker'
      ? i18n.t('canvas.sticker')
      : note.kind !== 'suggestion'
        ? note.title
        : undefined"
    :aria-labelledby="note.kind === 'suggestion' ? `${id}-strip ${id}-title` : undefined"
  >
    <!-- a slip from the agent, cut square: what it is in the strip, the proposal, what to do with it;
         its two answers are told whose they are by the slip they sit on (the group's name) -->
    <CtPaper
      v-if="note.kind === 'suggestion'"
      variant="proposal"
      :lifted="dragging"
      :paper
      :selected
    >
      <template #strip><span :id="`${id}-strip`">{{ i18n.t("note.suggestion") }}</span></template>
      <!-- five lines of it on the desk; picked, all of it -->
      <template #default>
        <p :id="`${id}-title`" class="title lines-5" :class="{ open: selected }">{{
          note.title
        }}</p>
      </template>
      <!-- held, not tapped: first a thumb up to keep it as a memo (the primary), then a thumb down
           to pass on it; the slip goes the moment one is full, so what it says when done is what
           it does -->
      <template #foot>
        <CtHoldButton
          class="answer"
          variant="primary"
          :done="i18n.t('note.adopt')"
          :hold-time="HOLD_MS"
          :label="i18n.t('note.adopt')"
          :title="i18n.t('note.adopt')"
          @hold="() => $emit('adopt')"
        >
          <template #icon><Icon :size="18" :src="thumbsUpIcon" /></template>
          <template #hint>{{ i18n.t("rooms.hold") }}</template>
        </CtHoldButton>
        <CtHoldButton
          class="answer"
          variant="outline"
          :done="i18n.t('common.dismiss')"
          :hold-time="HOLD_MS"
          :label="i18n.t('common.dismiss')"
          :title="i18n.t('common.dismiss')"
          @hold="() => $emit('remove')"
        >
          <template #icon><Icon :size="18" :src="thumbsDownIcon" /></template>
          <template #hint>{{ i18n.t("rooms.hold") }}</template>
        </CtHoldButton>
      </template>
    </CtPaper>
    <!-- words on the desk itself: no paper -->
    <p v-else-if="note.kind === 'text'" class="lettering">{{ note.title }}</p>
    <!-- a cut-out picture on the desk itself: edged in white, no paper -->
    <img
      v-else-if="note.kind === 'sticker'"
      alt=""
      class="cutout"
      draggable="false"
      :src="picture(note.image)"
    />
    <!-- a memo: a sticky, or with a picture a print (the picture mounted); then where it came
         from, the words, the tags and the day -->
    <CtPaper v-else :lifted="dragging" :paper :selected :variant="print ? 'print' : 'note'">
      <template #picture>
        <img
          alt=""
          class="shot"
          draggable="false"
          loading="lazy"
          :src="note.image === null ? undefined : picture(note.image)"
        />
      </template>
      <template #default>
        <!-- where the idea came from: its site, which opens the page -->
        <a
          v-if="safeUrl(note.link) !== undefined"
          class="link source"
          :href="safeUrl(note.link)"
          rel="noopener noreferrer"
          target="_blank"
          :aria-label="i18n.t('note.link')"
          @pointerdown.stop
          @click.stop
        ><Icon :size="11" :src="externalIcon" /><span class="site">{{ siteOf(note.link) }}</span></a
        >
        <!-- a memo holds links, so it is no button itself: its title is, which takes the
             card's keys (Enter opens it); dimmed, it is out of reach, as it is of a finger -->
        <p
          class="title"
          :class="print ? 'lines-2' : 'lines-3'"
          role="button"
          :tabindex="visibility !== 'dimmed' ? 0 : undefined"
        >{{
          note.title
        }}</p>
        <!-- the words, a few lines of them (a page's own line stays off its print, for the
             booklet); a link in them is its site, as every link on the desk is -->
        <p v-if="note.body !== '' && !(print && note.link !== null)" class="words"><template
            v-for="s in segments(note.body)"
            :key="s.at"
          ><a
              v-if="s.kind === 'link'"
              class="link"
              :href="safeUrl(s.url)"
              rel="noopener noreferrer"
              target="_blank"
              @pointerdown.stop
              @click.stop
            ><Icon :size="11" :src="externalIcon" /><span class="site">{{ siteOf(s.url) }}</span></a
            ><template v-else>{{
              s.text
            }}</template></template></p>
        <p v-if="note.tags.length > 0" class="tags">{{
          note.tags.map((t) => `#${t}`).join("  ")
        }}</p>
      </template>
      <template #foot>
        <!-- its day on the trip, once it has one: the desk shows how far the plan has come -->
        <CtBadge
          v-if="note.schedule !== null"
          as="time"
          class="day"
          :datetime="note.schedule.date.toString()"
        >{{ day }}</CtBadge>
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

/* typed, so a change of them eases (an untyped variable only swaps) */
@property --lift {
  syntax: "<number>";
  inherits: false;
  initial-value: 1;
}

@property --tilt {
  syntax: "<angle>";
  inherits: false;
  initial-value: 0deg;
}

/*
 * The card on the desk: where it is, how it is turned and how large. What it looks like is the
 * paper's (CtPaper); only the words written on it, and the two things that are not paper (words
 * on the desk, a sticker), are styled here. Every rule is a class: a bare element rule would
 * reach the paper's own root, which carries this component's scope too.
 */
.card {
  position: absolute;
  inset-inline-start: 0;
  inset-block-start: 0;
  width: 164px;
  /*
   * the card's place and tilt live in variables so the pop can scale it where it lands; a held
   * card is lifted on top of them (`--lift`, `--tilt`), which alone are eased: the place follows
   * the finger every frame
   */
  transform: translate(var(--x), var(--y)) rotate(calc(var(--rot) + var(--tilt)))
    scale(calc(var(--scale, 1) * var(--lift)));
  transform-origin: center;
  /* let go, it settles back onto the desk */
  transition:
    opacity .2s,
    filter var(--duration-swap) var(--ease-morph),
    --lift var(--duration-swap) var(--ease-morph),
    --tilt var(--duration-swap) var(--ease-morph);

  @media (--reduced-motion) {
    transition: none;
  }

  /* held: it comes up off the desk a little larger and askew, with one small overshoot */
  &.dragging {
    --lift: 1.05;
    --tilt: -2deg;
    z-index: var(--z-drag);
    will-change: transform;
    transition:
      filter var(--duration-swap) var(--ease-spring),
      --lift var(--duration-swap) var(--ease-spring),
      --tilt var(--duration-swap) var(--ease-spring);

    /* only its shadow says it is held */
    @media (--reduced-motion) {
      --lift: 1;
      --tilt: 0deg;
    }
  }

  &.visibility-dimmed {
    opacity: .22;
    filter: saturate(.2);
    pointer-events: none;
  }

  &.pop {
    animation: pop .5s cubic-bezier(.2,1.4,.4,1) both;

    @media (--reduced-motion) {
      animation: none;
    }
  }

  &.selected {
    z-index: var(--z-float);
  }

  /* a memo's button is its title; the keyboard's ring still goes round the whole card */
  &:has(.title:focus-visible) {
    outline: var(--ring-width) solid var(--ink);
    outline-offset: var(--ring-offset);

    .title {
      outline: none;
    }
  }

  /* a print is the wider cut */
  &.print {
    width: 220px;
  }
}

/* ---- what is written on paper: one scale for every cut ---- */

/* a print's picture, 16:9 in its frame; touches go to the card under it */
.shot {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
  object-fit: cover;
  pointer-events: none;
}

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

  /* a proposal is a sentence: five lines of it, all of it once picked */
  &.lines-5 {
    -webkit-line-clamp: 5;
  }

  &.open {
    -webkit-line-clamp: unset;
  }

  /* a print's caption under its picture: two lines of it */
  &.lines-2 {
    -webkit-line-clamp: 2;
  }
}

.words {
  margin: 4px 0 0;
  font-size: var(--font-xs);
  line-height: 1.45;
  color: var(--paper-muted);
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.tags {
  margin: 6px 0 0;
  font-size: var(--font-xs);
  font-weight: 700;
  line-height: 1.3;
  color: var(--paper-muted);
  white-space: pre;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* a link, wherever it is on the desk: the arrow that means elsewhere, and the site, in ink */
.link {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  max-width: 100%;
  min-width: 0;
  vertical-align: bottom;
  color: var(--paper-ink);
  font-size: var(--font-xs);
  font-weight: 700;
  line-height: 1.45;
  text-decoration: underline;
  text-decoration-color: color-mix(in oklch, var(--paper-ink) 35%, transparent);
  text-underline-offset: 2px;
  white-space: nowrap;
}

.site {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

/*
 * Whatever is pressed on paper (a link, a slip's two actions) aims at a touch 24px across on
 * screen (WCAG 2.5.8): the target reaches past what is drawn by what the card's scale and the
 * desk's zoom took off it. It reaches only into the room around it (--room), never over the
 * words beside it or the next action, nor off the paper: zoomed far out, the card is picked
 * and dragged rather than pressed through.
 */
.link,
.keep,
.dismiss {
  --reach: calc(24px / (var(--scale, 1) * var(--zoom, 1)));
  --room: 6px;

  &::after {
    content: "";
    position: absolute;
    inset-block: max(calc(var(--room) * -1), min(0px, calc((100% - var(--reach)) / 2)));
    inset-inline: max(calc(var(--room) * -1), min(0px, calc((100% - var(--reach)) / 2)));
  }
}

.words {
  /* a link in the words has the lines beside it, and nothing else */
  > .link {
    --room: 2px;
  }
}

/* above a memo's title, on its own line */
.source {
  display: flex;
  width: fit-content;
  margin: 0 0 8px;
}

/* a day, wherever it is on the desk: a small stamp, at the end of its line */
.day {
  margin-inline-start: auto;
}

/*
 * A slip's two answers, as simple as a swipe: two halves of its foot, side by side across the
 * width inside its padding, each held (CtHoldButton) until it fills from its start edge: the
 * primary, a thumb up to keep it, then the outline, a thumb down to pass on it, both in the
 * paper's ink (CtPaper's foot is paper). Each is a thumb's width already, so its target is
 * what is drawn and reaches no further, never into the padding.
 */
.answer {
  flex: 1;
  padding: 0;
}

/*
 * The handles: a thumb-sized target with a small dot in it, the same size on screen whatever
 * the card's scale and the desk's zoom (both undone by their own scale)
 */
.card {
  > [data-handle] {
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
}

/*
 * A text box: the desk's own lettering, no paper and no shadow, in the desk's ink so it reads
 * in either theme, as wide as its longest line up to a point. Picked, it is framed like a card.
 */
.card.kind-text {
  width: max-content;
  max-width: 560px;
  padding: var(--text-box-pad);
  border-radius: 4px;

  &.selected {
    box-shadow: 0 0 0 2px var(--ink);
  }
}

.lettering {
  margin: 0;
  color: var(--ink);
  font-size: var(--text-box-size);
  font-weight: 700;
  line-height: 1.3;
  letter-spacing: 0.02em;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

/*
 * A sticker: the picture alone, its outline traced in white like a die-cut sticker and lifted
 * off the desk by a soft shadow that follows the cut. Picked, it is framed like a card.
 */
.card.kind-sticker {
  width: var(--sticker-size);
  border-radius: 4px;

  &.selected {
    box-shadow: 0 0 0 2px var(--ink);
  }

  &.dragging > .cutout {
    filter: var(--sticker-edge) drop-shadow(0 8px 10px rgb(0 0 0 / .22));
  }
}

.cutout {
  display: block;
  width: 100%;
  height: auto;
  object-fit: contain;
  filter: var(--sticker-edge) drop-shadow(0 2px 3px rgb(0 0 0 / .2));
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
