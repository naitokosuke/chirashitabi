<script setup lang="ts" vapor>
import { useNotes } from "@/notes/store";
import { MEMBERS, type Note } from "@/notes/types";

defineProps<{ note: Note; dragging: boolean; pop: boolean; dim: boolean; hidden: boolean }>();
defineEmits<{ adopt: []; remove: [] }>();
const store = useNotes();
</script>

<template>
  <div
    v-show="!hidden"
    class="card"
    :class="{ claude: note.kind === 'claude', dragging, pop, dim }"
    :style="`transform: translate(${note.x}px, ${note.y}px) rotate(${note.rot}deg); --card: ${note.color}`"
    :data-id="note.id"
  >
    <template v-if="note.kind === 'claude'">
      <div class="h">
        <svg aria-hidden="true" fill="#D97757" height="14" viewBox="0 0 24 24" width="14"><path d="M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z" /></svg>
        Claude<small>提案</small>
      </div>
      <p class="t">{{ note.title }}</p>
      <div class="act"><button class="ok" type="button" @click.stop="() => $emit('adopt')">採用</button><button class="no" type="button" @click.stop="() => $emit('remove')">消す</button></div>
    </template>
    <template v-else>
      <p class="t">{{ note.title }}</p>
      <p v-if="note.body" class="b">{{ note.body }}</p>
      <p v-if="note.tags.length" class="tags"><span v-for="t in note.tags" :key="t" :style="`color:${store.tagColor(t)}`">#{{ t }}</span></p>
      <span class="who" :style="`background:${MEMBERS[note.by]}`"></span>
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
  box-shadow: 0 3px 10px rgba(28,34,56,.14);
  transform-origin: center;
  transition: opacity .2s, filter .2s;
  &.dragging {
    box-shadow: 0 14px 28px rgba(28,34,56,.28);
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
}

.who {
  position: absolute;
  inset-block-start: 8px;
  inset-inline-end: 8px;
  width: 9px;
  height: 9px;
  border-radius: 50%;
}

.card.claude {
  background: var(--ivory);
  color: var(--slate);
  border: 1px solid var(--oat);
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
  width: 186px;
  border-radius: 10px;
  & .h {
    display: flex;
    align-items: center;
    gap: 5px;
    font-family: Georgia, 'Times New Roman', serif;
    font-size: var(--font-md);
    margin-block-end: 4px;
    & small {
      margin-inline-start: auto;
      font-family: system-ui, sans-serif;
      font-size: var(--font-2xs);
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
      min-height: 30px;
      padding: 0 12px;
      border-radius: 999px;
      font-size: var(--font-xs);
      font-weight: 600;
    }
    & .ok {
      background: var(--clay);
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

@keyframes pop {
  0% {
    transform: scale(.3) rotate(-8deg);
    opacity: 0
  }
  60% {
    transform: scale(1.08) rotate(1deg);
    opacity: 1
  }
  100% {
    transform: none
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
