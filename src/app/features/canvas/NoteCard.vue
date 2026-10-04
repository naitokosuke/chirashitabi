<script setup lang="ts" vapor>
import { computed } from "vue";

import { useI18n } from "../../i18n/useI18n";

import { useMembers } from "../members/useMembers";
import { imageSrc } from "../notes/image";
import { PAPERS, type Note } from "../notes/types";
import { useSync } from "../sync/useSync";
import type { Visibility } from "../tags/types";

const props = defineProps<{
  note: Note;
  dragging: boolean;
  pop: boolean;
  visibility: Visibility;
  /** Picked on the desk: framed, with handles to resize and to turn it */
  selected: boolean;
}>();
defineEmits<{ adopt: []; remove: [] }>();
const members = useMembers();
/** Whose card it is; nobody once they have left the room */
const author = computed(() => members.value?.find((m) => m.id === props.note.by));
const sync = useSync();
const i18n = useI18n();
</script>

<template>
  <div
    v-show="visibility !== 'hidden'"
    :data-kind="note.kind"
    :data-dragging="dragging || undefined"
    :data-pop="pop || undefined"
    :data-selected="selected || undefined"
    :data-visibility="visibility"
    :style="`--x: ${note.x}px; --y: ${note.y}px; --rot: ${note.rot}deg; --scale: ${note.scale}; --card: ${PAPERS[note.color]}; --who: ${author?.color ?? 'var(--muted)'}`"
    :data-id="note.id"
    :tabindex="note.kind !== 'suggestion' && visibility !== 'dimmed' ? 0 : undefined"
    :role="note.kind !== 'suggestion' ? 'button' : undefined"
    :aria-label="note.kind !== 'suggestion' ? note.title : undefined"
  >
    <template v-if="note.kind === 'suggestion'">
      <header>
        <span aria-hidden="true"></span>
        {{ author?.name ?? i18n.t("member.someone") }}<small>{{ i18n.t("note.suggestion") }}</small>
      </header>
      <p>{{ note.title }}</p>
      <footer><button type="button" @click.stop="() => $emit('adopt')">{{ i18n.t("note.adopt") }}</button><button type="button" @click.stop="() => $emit('remove')">{{ i18n.t("common.dismiss") }}</button></footer>
    </template>
    <!-- words on the desk itself: no paper, no author's dot -->
    <p v-else-if="note.kind === 'text'">{{ note.title }}</p>
    <template v-else>
      <!-- the card's picture, across its top; the card is still what a finger holds -->
      <img
        v-if="note.image"
        alt=""
        draggable="false"
        loading="lazy"
        :src="imageSrc(sync.roomId, note.image)"
      />
      <p>{{ note.title }}</p>
      <p v-if="note.body">{{ note.body }}</p>
      <ul v-if="note.tags.length"><li v-for="t in note.tags" :key="t">#{{ t }}</li></ul>
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

  /* the title */
  > p:first-of-type {
    margin: 0;
    font-size: var(--font-base);
    font-weight: 700;
    line-height: 1.4;
    word-break: break-word;
  }

  /* the body, under the title */
  > p + p {
    margin: 4px 0 0;
    font-size: var(--font-xs);
    color: var(--paper-muted);
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
