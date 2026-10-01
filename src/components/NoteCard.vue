<script setup lang="ts" vapor>
import { useNotes } from '@/stores/notes'
import { MEMBERS, type Note } from '@/lib/types'

defineProps<{ note: Note; dragging: boolean; pop: boolean; dim: boolean; hidden: boolean }>()
defineEmits<{ adopt: []; remove: [] }>()
const store = useNotes()
</script>

<template>
  <div class="card" :class="{ claude: note.kind === 'claude', dragging, pop, dim, hidden }"
       :style="`transform: translate(${note.x}px, ${note.y}px) rotate(${note.rot}deg); --card: ${note.color}`"
       :data-id="note.id">
    <template v-if="note.kind === 'claude'">
      <div class="h">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="#D97757" aria-hidden="true"><path d="M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z"/></svg>
        Claude<small>提案</small>
      </div>
      <p class="t">{{ note.title }}</p>
      <div class="act"><button class="ok" @click.stop="$emit('adopt')">採用</button><button class="no" @click.stop="$emit('remove')">消す</button></div>
    </template>
    <template v-else>
      <p class="t">{{ note.title }}</p>
      <p v-if="note.body" class="b">{{ note.body }}</p>
      <p v-if="note.tags.length" class="tags"><span v-for="t in note.tags" :key="t" :style="`color:${store.tagColor(t)}`">#{{ t }}</span></p>
      <span class="who" :style="`background:${MEMBERS[note.by] ?? '#9aa09c'}`"></span>
    </template>
  </div>
</template>

<style scoped>
.card { position: absolute; left: 0; top: 0; width: 164px; padding: 12px; border-radius: 6px; background: var(--card, #fff1b8); color: #1c2238;
  box-shadow: 0 3px 10px rgba(28,34,56,.14); transform-origin: center; transition: opacity .2s, filter .2s; }
.card.dragging { box-shadow: 0 14px 28px rgba(28,34,56,.28); z-index: 10; will-change: transform; transition: none; }
.card.dim { opacity: .22; filter: saturate(.2); pointer-events: none; }
.card.hidden { display: none; }
.t { margin: 0; font-size: 15px; font-weight: 700; line-height: 1.4; word-break: break-word; }
.b { margin: 4px 0 0; font-size: 12px; color: #4b5563; }
.tags { margin: 6px 0 0; font-size: 12px; font-weight: 700; display: flex; flex-wrap: wrap; gap: 2px 8px; }
.who { position: absolute; top: 8px; right: 8px; width: 9px; height: 9px; border-radius: 50%; }
.card.claude { background: var(--ivory); color: var(--slate); border: 1px solid var(--oat); font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; width: 186px; border-radius: 10px; }
.card.claude .h { display: flex; align-items: center; gap: 5px; font-family: Georgia, 'Times New Roman', serif; font-size: 14px; margin-bottom: 4px; }
.card.claude .h small { margin-left: auto; font-family: system-ui, sans-serif; font-size: 11px; color: #73726C; }
.card.claude .t { font-weight: 400; font-size: 13px; }
.card.claude .act { display: flex; gap: 6px; margin-top: 8px; }
.card.claude .act button { min-height: 30px; padding: 0 12px; border-radius: 999px; font-size: 12px; font-weight: 600; }
.card.claude .act .ok { background: var(--clay); color: #fff; }
.card.claude .act .no { border: .5px solid rgba(31,30,29,.3); }
.card.pop { animation: pop .5s cubic-bezier(.2,1.4,.4,1) both; }
@keyframes pop { 0% { transform: scale(.3) rotate(-8deg); opacity: 0 } 60% { transform: scale(1.08) rotate(1deg); opacity: 1 } 100% { transform: none } }
@media (prefers-reduced-motion: reduce) { .card.pop { animation: none } .card { transition: none } }
</style>
