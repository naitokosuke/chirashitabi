# ちらしたび（chirashitabi）

散らかしてから、しおりになる。2人で使う旅のブレストノート。
アプリ名が「ちらしたび」、旅ごとのルーム名が「台湾たび」のように付く。

キャンバス試作を Vite + Vue 3.6 RC の Vapor Mode で SFC に分けたもの。

```bash
npm install     # .npmrc に legacy-peer-deps=true（pinia の peer 範囲が 3.6 の RC を含まないため）
npm run dev
npm run build   # vue-tsc + vite build
```

## 構成

```
src/main.ts              createVaporApp でアプリ全体を Vapor で起動
src/App.vue              キャンバス ↔ フォームの画面切り替え（キャンバスは常に裏で生きている）
src/views/CanvasView.vue パン / ピンチ / ドラッグ / 長押し、フィルタ表示、ポップ
src/views/FormView.vue   全画面の入力フォーム（新規・編集、Google マップのリンク → 座標）
src/views/MapView.vue    MapLibre + OpenFreeMap。ピン、タグ絞り込み、日の道順、長押しで追加
src/views/ShioriView.vue しおり（編集 / 閲覧、付録、Claude の下書き）
src/components/NoteCard.vue, FilterBar.vue
src/stores/notes.ts      Pinia。メモ、タグ、フィルタ状態、Transport（同期の差し込み口）
src/lib/viewport.ts      画面座標 ↔ ワールド座標、ズーム、アニメーション
src/lib/types.ts, seed.ts, geo.ts（Maps URL から緯度経度を抜く）
```

全コンポーネントが `<script setup vapor>`。VDOM 専用のものを混ぜたくなったら
`main.ts` を `createApp(App).use(vaporInteropPlugin)` に変えるだけ。

## 同期の差し込み口

`stores/notes.ts` の `transport.send(mutation)` が唯一の出口で、いまは何もしない。
Cloudflare 側（Durable Object + WebSocket）ができたら、

1. `transport.value = { send: (m) => ws.send(JSON.stringify(m)) }`
2. サーバーからのスナップショットを `store.apply(notes)` に渡す

で接続できる。ドラッグ中の `note:move` は 80ms 間隔に間引いてある。

## サクサクのための約束

- ポインタ状態（drag / pan / pinch）は普通の変数。リアクティブにしない
- カードは `transform` だけで動かす。ドラッグ中だけ `will-change`
- フィルタで薄くしたカードは `pointer-events: none`
- 画面遷移中はキャンバスをアンマウントしない

## 地図

- タイルは OpenFreeMap（`https://tiles.openfreemap.org/styles/liberty`）。キー不要・無料。
- 座標はフォームに貼った Google マップのリンクから取る。`maps.app.goo.gl` の短縮リンクは
  Worker 側でリダイレクト先を取ってから `parseMapsUrl` に渡す（未実装、`lib/geo.ts` 参照）。
- 取れないときは地図を長押しして置く。
- Google マップは「開く」リンクのみ。1件の詳細に iframe（Maps Embed API、無料・要キー）を出す余地あり。
