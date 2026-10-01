# ちらしたび（chirashitabi）

散らかしてから、しおりになる。2人で使う旅のブレストノート。
アプリ名が「ちらしたび」、旅ごとのルーム名が「台湾たび」のように付く。

キャンバス試作を Vue 3.6 RC の Vapor Mode で SFC に分けたもの。
ツールチェーンは pnpm + [Vite+](https://viteplus.dev/)（`vp`）、SFC のコンパイル・型検査・lint・整形は [Vize](https://github.com/ubugeeei-prod/vize)。

```bash
vp install
vp dev
vp run check   # 整形 + lint + 型検査（Vize）
vp build
vp build -c vite.single.config.ts   # 1 ファイルにまとめた版（dist-single/）
```

## 構成

技術的な種類（components / stores / lib）ではなく、機能ごとにまとめる。

```
src/main.ts, App.vue, style.css   起動と画面切り替え（キャンバスは常に裏で生きている）
src/notes/     メモというドメイン。Pinia ストア（タグ、フィルタ状態、Transport = 同期の差し込み口）、型、シード
src/canvas/    キャンバス。パン / ピンチ / ドラッグ / 長押し、フィルタバー、カード、座標変換（viewport.ts）
src/form/      全画面の入力フォーム（新規・編集、Google マップのリンク → 座標）
src/map/       MapLibre + OpenFreeMap。ピン、タグ絞り込み、日の道順、長押しで追加。Maps URL の解析
src/shiori/    しおり（編集 / 閲覧、付録、Claude の下書き）
```

## Vize で Vapor を使うときの注意

Vize の Vapor 出力は今のところ、テンプレート ref が `ref()` に入らず、コンポーネントへの `ref` も効かない。

- 要素の参照は `useTemplateRef("name")` で取る
- 子コンポーネントの関数が欲しいときは `defineExpose` ではなくイベントで渡す（`CanvasView` の `@ready`）

全コンポーネントが `<script setup vapor>`。VDOM 専用のものを混ぜたくなったら
`main.ts` を `createApp(App).use(vaporInteropPlugin)` に変えるだけ。

## 同期の差し込み口

`notes/store.ts` の `transport.send(mutation)` が唯一の出口で、いまは何もしない。
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
  Worker 側でリダイレクト先を取ってから `parseMapsUrl` に渡す（未実装、`map/google-maps.ts` 参照）。
- 取れないときは地図を長押しして置く。
- Google マップは「開く」リンクのみ。1件の詳細に iframe（Maps Embed API、無料・要キー）を出す余地あり。
