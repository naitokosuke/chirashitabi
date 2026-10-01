import { defineStore } from 'pinia'
import { computed, reactive, ref, shallowRef } from 'vue'
import { COLORS, TAG_COLORS, type Day, type Note, type NoteInput } from '@/lib/types'
import { seed } from '@/lib/seed'

export const ME = 'yuki'
const uid = () => Math.random().toString(36).slice(2, 10)

/**
 * Transport is the only thing that changes when the Cloudflare room arrives:
 * `send` pushes a mutation, and the room calls `apply` with the authoritative
 * snapshot. Until then it is a local no-op.
 */
export interface Transport {
  send(msg: Mutation): void
}
export type Mutation =
  | { type: 'note:add'; note: Note }
  | { type: 'note:update'; id: string; patch: Partial<Note> }
  | { type: 'note:move'; id: string; x: number; y: number } // throttled while dragging
  | { type: 'note:delete'; id: string }
  | { type: 'day:intro'; date: string; intro: string }

export const useNotes = defineStore('notes', () => {
  // Array of plain objects: cards read x/y through the array, so moving one card
  // only touches that object. shallowRef would skip updates; reactive is right here.
  const notes = reactive<Note[]>(seed())
  const transport = shallowRef<Transport>({ send: () => {} })
  const days = reactive<Day[]>([
    { date: '2026-11-03', intro: '' }, { date: '2026-11-04', intro: '' }, { date: '2026-11-05', intro: '' }, { date: '2026-11-06', intro: '' },
  ])

  // ---- tags & filter (view state, never synced) ----
  const tagColorMap = new Map<string, string>()
  function tagColor(t: string) {
    if (!tagColorMap.has(t)) tagColorMap.set(t, TAG_COLORS[tagColorMap.size % TAG_COLORS.length])
    return tagColorMap.get(t)!
  }
  const tagList = computed(() => {
    const c = new Map<string, number>()
    for (const n of notes) for (const t of n.tags) c.set(t, (c.get(t) ?? 0) + 1)
    return [...c].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count, color: tagColor(name) }))
  })
  const selected = reactive(new Set<string>())
  const mode = ref<'dim' | 'only'>('dim')
  const toggleTag = (t: string) => (selected.has(t) ? selected.delete(t) : selected.add(t))
  const matches = (n: Note) => selected.size === 0 || n.tags.some((t) => selected.has(t))

  // ---- mutations (local first, then transport) ----
  function add(input: NoteInput, at: { x: number; y: number }): Note {
    const n: Note = {
      id: uid(), kind: 'note', by: ME, updatedAt: Date.now(),
      x: at.x + (Math.random() * 20 - 10), y: at.y + (Math.random() * 20 - 10), rot: Math.random() * 4 - 2,
      ...input,
    }
    notes.push(n)
    transport.value.send({ type: 'note:add', note: n })
    return n
  }
  function update(id: string, patch: Partial<Note>) {
    const n = byId(id)
    if (!n) return
    Object.assign(n, patch, { updatedAt: Date.now() })
    transport.value.send({ type: 'note:update', id, patch })
  }
  function move(id: string, x: number, y: number, final = false) {
    const n = byId(id)
    if (!n) return
    n.x = x; n.y = y
    if (final) n.updatedAt = Date.now()
    transport.value.send({ type: 'note:move', id, x, y })
  }
  function remove(id: string) {
    const i = notes.findIndex((n) => n.id === id)
    if (i >= 0) notes.splice(i, 1)
    transport.value.send({ type: 'note:delete', id })
  }
  function duplicate(id: string) {
    const n = byId(id)
    if (!n) return
    return add({ title: n.title, body: n.body, tags: [...n.tags], color: n.color }, { x: n.x + 24, y: n.y + 24 })
  }
  function adopt(id: string) {
    update(id, { kind: 'note', color: '#ffffff', tags: ['Claude'] })
  }
  const byId = (id: string) => notes.find((n) => n.id === id)

  // ---- booklet (しおり) helpers ----
  const unassigned = computed(() => notes.filter((n) => n.kind === 'note' && !n.date && !n.tags.includes('持ち物')))
  const timeKey = (n: Note) => (n.time ? n.time : '99:99')
  const forDay = (date: string, status?: Note['status']) =>
    notes.filter((n) => n.kind === 'note' && n.date === date && (!status || (n.status ?? 'idea') === status))
         .sort((a, b) => timeKey(a).localeCompare(timeKey(b)) || a.updatedAt - b.updatedAt)
  const byTag = (tag: string) => notes.filter((n) => n.kind === 'note' && n.tags.includes(tag))
  const budgetOf = (date?: string, onlyFixed = true) =>
    notes.filter((n) => n.kind === 'note' && (!date || n.date === date) && (!onlyFixed || n.status === 'fixed'))
         .reduce((s, n) => s + (n.budget ?? 0), 0)
  function setIntro(date: string, intro: string) {
    const d = days.find((d) => d.date === date); if (d) d.intro = intro
    transport.value.send({ type: 'day:intro', date, intro })
  }

  /** Called by the room when an authoritative snapshot arrives. */
  function apply(snapshot: Note[]) {
    notes.splice(0, notes.length, ...snapshot)
  }

  return { notes, days, transport, tagList, tagColor, selected, mode, toggleTag, matches,
           add, update, move, remove, duplicate, adopt, byId, apply, COLORS,
           unassigned, forDay, byTag, budgetOf, setIntro }
})
