<script setup lang="ts" vapor>
import { useI18n } from "../../i18n/useI18n";

import { useMembers } from "../members/useMembers";
import { imageSrc } from "../notes/image";
import { PAPERS, type Note } from "../notes/types";
import { useSync } from "../sync/useSync";
import type { Visibility } from "../tags/types";

defineProps<{ note: Note; dragging: boolean; pop: boolean; visibility: Visibility }>();
defineEmits<{ adopt: []; remove: [] }>();
const members = useMembers();
const sync = useSync();
const i18n = useI18n();
</script>

<template>
  <div
    v-show="visibility !== 'hidden'"
    :data-kind="note.kind"
    :data-dragging="dragging || undefined"
    :data-pop="pop || undefined"
    :data-visibility="visibility"
    :style="`--x: ${note.x}px; --y: ${note.y}px; --rot: ${note.rot}deg; --card: ${PAPERS[note.color]}; --who: ${members.colorOf(note.by)}`"
    :data-id="note.id"
    :tabindex="note.kind === 'memo' && visibility !== 'dimmed' ? 0 : undefined"
    :role="note.kind === 'memo' ? 'button' : undefined"
    :aria-label="note.kind === 'memo' ? note.title : undefined"
  >
    <template v-if="note.kind === 'suggestion'">
      <header>
        <span aria-hidden="true"></span>
        {{ members.nameOf(note.by) }}<small>{{ i18n.t("note.suggestion") }}</small>
      </header>
      <p>{{ note.title }}</p>
      <footer><button type="button" @click.stop="() => $emit('adopt')">{{ i18n.t("note.adopt") }}</button><button type="button" @click.stop="() => $emit('remove')">{{ i18n.t("common.dismiss") }}</button></footer>
    </template>
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
  transform: translate(var(--x), var(--y)) rotate(var(--rot));
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

  /* who wrote it */
  > span {
    position: absolute;
    inset-block-start: 8px;
    inset-inline-end: 8px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--who);
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
    transform: translate(var(--x), var(--y)) rotate(calc(var(--rot) - 8deg)) scale(.3);
    opacity: 0
  }
  60% {
    transform: translate(var(--x), var(--y)) rotate(calc(var(--rot) + 1deg)) scale(1.08);
    opacity: 1
  }
  100% {
    transform: translate(var(--x), var(--y)) rotate(var(--rot))
  }
}
</style>
