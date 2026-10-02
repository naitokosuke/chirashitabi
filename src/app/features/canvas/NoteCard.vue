<script setup lang="ts" vapor>
import { useI18n } from "../../i18n/useI18n";

import { useMembers } from "../members/useMembers";
import type { Note } from "../notes/types";
import type { Visibility } from "../tags/types";
import { useTags } from "../tags/useTags";

defineProps<{ note: Note; dragging: boolean; pop: boolean; visibility: Visibility }>();
defineEmits<{ adopt: []; remove: [] }>();
const tags = useTags();
const members = useMembers();
const i18n = useI18n();
</script>

<template>
  <div
    v-show="visibility !== 'hidden'"
    class="card"
    :class="{ suggestion: note.kind === 'suggestion', dragging, pop, dim: visibility === 'dimmed' }"
    :style="`--x: ${note.x}px; --y: ${note.y}px; --rot: ${note.rot}deg; --card: ${note.color}; --who: ${members.colorOf(note.by)}`"
    :data-id="note.id"
    :tabindex="note.kind === 'memo' && visibility !== 'dimmed' ? 0 : undefined"
    :role="note.kind === 'memo' ? 'button' : undefined"
    :aria-label="note.kind === 'memo' ? note.title : undefined"
  >
    <template v-if="note.kind === 'suggestion'">
      <div class="h">
        <span aria-hidden="true" class="dot"></span>
        {{ members.nameOf(note.by) }}<small>{{ i18n.t("note.suggestion") }}</small>
      </div>
      <p class="t">{{ note.title }}</p>
      <div class="act"><button class="ok" type="button" @click.stop="() => $emit('adopt')">{{ i18n.t("note.adopt") }}</button><button class="no" type="button" @click.stop="() => $emit('remove')">{{ i18n.t("common.dismiss") }}</button></div>
    </template>
    <template v-else>
      <p class="t">{{ note.title }}</p>
      <p v-if="note.body" class="b">{{ note.body }}</p>
      <p v-if="note.tags.length" class="tags"><span v-for="t in note.tags" :key="t" :style="`--tag:${tags.tagColor(t)}`">#{{ t }}</span></p>
      <span class="who"></span>
    </template>
  </div>
</template>

<style scoped>
.card {
  position: absolute;
  inset-inline-start: 0;
  inset-block-start: 0;
  width: 164px;
  padding: 12px;
  border-radius: 6px;
  background: var(--card, var(--paper));
  color: var(--paper-ink);
  box-shadow: var(--shadow-paper);
  /* the card's place and tilt live in variables so the pop can scale it where it lands */
  transform: translate(var(--x), var(--y)) rotate(var(--rot));
  transform-origin: center;
  transition: opacity .2s, filter .2s;
  &.dragging {
    box-shadow: var(--shadow-lift);
    z-index: var(--z-drag);
    will-change: transform;
    transition: none;
  }
  &.dim {
    opacity: .22;
    filter: saturate(.2);
    pointer-events: none;
  }
}

.t {
  margin: 0;
  font-size: var(--font-base);
  font-weight: 700;
  line-height: 1.4;
  word-break: break-word;
}

.b {
  margin: 4px 0 0;
  font-size: var(--font-xs);
  color: var(--paper-muted);
}

.tags {
  margin: 6px 0 0;
  font-size: var(--font-xs);
  font-weight: 700;
  display: flex;
  flex-wrap: wrap;
  gap: 2px 8px;
  /* a tag's color on paper: pulled toward the paper's ink so every stock carries it */
  & span {
    color: color-mix(in oklch, var(--tag) var(--tint-paper-mix), var(--paper-ink));
  }
}

.who {
  position: absolute;
  inset-block-start: 8px;
  inset-inline-end: 8px;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--who);
}

.card.suggestion {
  background: var(--ivory);
  color: var(--slate);
  border: 1px solid var(--oat);
  width: 186px;
  /* square: a machine's note is cut straight, a person's has the paper's soft corner */
  border-radius: 0;
  & .h {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: var(--font-md);
    font-weight: 700;
    margin-block-end: 4px;
    & .dot {
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: var(--who);
    }
    & small {
      margin-inline-start: auto;
      font-size: var(--font-2xs);
      font-weight: 400;
      color: var(--stone);
    }
  }
  & .t {
    font-weight: 400;
    font-size: var(--font-sm);
  }
  & .act {
    display: flex;
    gap: 6px;
    margin-block-start: 8px;
    & button {
      min-height: var(--tap);
      padding: 0 12px;
      border-radius: 999px;
      font-size: var(--font-xs);
      font-weight: 700;
    }
    & .ok {
      /* the member's color, deepened so white reads on it whatever the member picked */
      background: color-mix(in oklch, var(--who) 70%, #1c2238);
      color: var(--on-accent);
    }
    & .no {
      border: .5px solid rgba(31,30,29,.3);
    }
  }
}

.card.pop {
  animation: pop .5s cubic-bezier(.2,1.4,.4,1) both;
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

@media (prefers-reduced-motion: reduce) {
  .card.pop {
    animation: none
  }
  .card {
    transition: none
  }
}
</style>
