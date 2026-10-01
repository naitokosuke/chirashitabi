export type NoteKind = 'note' | 'claude'

export interface Note {
  id: string
  kind: NoteKind
  title: string
  body: string
  tags: string[]
  color: string
  x: number
  y: number
  rot: number
  by: string
  // optional, added later for the itinerary
  date?: string
  time?: string
  budget?: number | null
  mapsUrl?: string
  status?: 'idea' | 'fixed' | 'done'
  lat?: number
  lng?: number
  updatedAt: number
}

export type NoteInput = Pick<Note, 'title' | 'body' | 'tags' | 'color'> & Partial<Pick<Note, 'lat' | 'lng' | 'mapsUrl'>>

export interface Day {
  date: string      // YYYY-MM-DD
  intro: string     // 2-3 lines written for the booklet, not a note
}

export const COLORS = ['#fff1b8', '#ffd9de', '#d8f0e6', '#dbe7ff', '#ead9ff', '#ffffff']
export const TAG_COLORS = ['#b11f33', '#a06f00', '#1f6b53', '#2b5bc4', '#7a3fb0', '#b85c1a', '#0f7a8a']
export const MEMBERS: Record<string, string> = { yuki: '#3c6ee0', ken: '#d7263d', claude: '#D97757' }
