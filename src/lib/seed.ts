import type { Note } from './types'

let i = 0
const n = (p: Partial<Note> & Pick<Note, 'title' | 'x' | 'y'>): Note => ({
  id: 's' + i++, kind: 'note', body: '', tags: [], color: '#fff1b8', rot: 0, by: 'yuki', status: 'idea', updatedAt: Date.now(), ...p,
})

export const seed = (): Note[] => [
  n({ title: '鼎泰豐 小籠包', lat: 25.0335, lng: 121.5301, body: '本店は並ぶので 101 店舗でもいい', tags: ['グルメ'], x: 40, y: 40, rot: -2, by: 'ken', date: '2026-11-03', time: '12:30', status: 'fixed', budget: 700, mapsUrl: 'https://maps.google.com/?q=鼎泰豐' }),
  n({ title: '九份は夕方に', lat: 25.1094, lng: 121.8453, body: '提灯がつく時間を狙う。帰りのバスが混む', tags: ['九份', '行きたい'], color: '#ffd9de', x: 230, y: 52, rot: 1.5, date: '2026-11-03', time: '16:00', status: 'fixed', mapsUrl: 'https://maps.google.com/?q=九份' }),
  n({ title: '臺虎精釀', lat: 25.0378, lng: 121.5629, body: '信義。夜市のあとに寄る', tags: ['ビール'], x: 60, y: 180, rot: 1, date: '2026-11-03', time: '20:30', status: 'fixed', budget: 400 }),
  n({ title: '士林夜市', lat: 25.0881, lng: 121.5244, body: '胡椒餅と大腸包小腸', tags: ['グルメ', '行きたい'], color: '#ffffff', x: 240, y: 190, rot: -1, by: 'ken', date: '2026-11-03', status: 'idea', budget: 500 }),
  n({ title: '迪化街で乾物', lat: 25.0557, lng: 121.5100, body: 'からすみ、お茶', tags: ['買い物'], color: '#d8f0e6', x: 50, y: 360, rot: 2, date: '2026-11-04', time: '10:00', status: 'fixed', budget: 1500 }),
  n({ title: '台北101 展望台', lat: 25.0339, lng: 121.5645, body: '天気次第', tags: ['行きたい'], color: '#ffffff', x: 240, y: 370, rot: -2.5, by: 'ken', date: '2026-11-04', status: 'idea', budget: 600 }),
  n({ title: '思慕昔 かき氷', lat: 25.0330, lng: 121.5297, body: '永康街。2人で1つ', tags: ['スイーツ'], x: 250, y: 510, rot: 0.5 }),
  n({ kind: 'claude', title: '11/4 は迪化街 → 台北101 の順だと MRT 1本。かき氷は 101 のあと永康街で', x: 30, y: 500, rot: -1, by: 'claude' }),
  n({ title: '金色三麥 ハニーラガー', lat: 25.0415, lng: 121.5460, body: '甘いらしい。1杯でいい', tags: ['ビール'], x: 480, y: 60, rot: 1, by: 'ken' }),
  n({ title: '胃薬と絆創膏', tags: ['持ち物'], color: '#d8f0e6', x: 500, y: 240, rot: -1 }),
  n({ title: 'パスポート、SIM、折りたたみ傘', tags: ['持ち物'], color: '#d8f0e6', x: 700, y: 250, rot: 1 }),
  n({ title: '悠遊カードは空港で', tags: ['到着したら'], color: '#dbe7ff', x: 480, y: 380, rot: 2 }),
]
