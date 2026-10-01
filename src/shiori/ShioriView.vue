<script setup lang="ts" vapor>
import { computed, ref } from "vue";
import { useNotes } from "@/notes/store";
import type { Note } from "@/notes/types";

const store = useNotes();
const editing = ref(true);
const tab = ref<string>(store.days[0].date); // a date, or 'appendix'
const picking = ref<Note | null>(null); // note being assigned from the tray
const draft = ref<{ date: string; lines: string[] } | null>(null); // Claude's draft

const STATUS: Record<string, string> = { idea: "候補", fixed: "確定", done: "済" };
const APPENDIX_TAGS = ["持ち物", "到着したら"];

const fmt = (date: string) => {
  const d = new Date(date + "T00:00:00");
  return d.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric", weekday: "short" });
};
const short = (date: string) => fmt(date).replace(/\(.*\)/, "");
const dayIndex = (date: string) => store.days.findIndex((d) => d.date === date) + 1;
const yen = (n: number) => "NT$ " + n.toLocaleString("ja-JP");

const totalFixed = computed(() => store.budgetOf(undefined, true));
const totalAll = computed(() => store.budgetOf(undefined, false));
const fixedCount = computed(() => store.notes.filter((n) => n.status === "fixed").length);

function assign(n: Note, date: string | null) {
  store.update(n.id, {
    date: date ?? undefined,
    time: date ? n.time : undefined,
    status: date ? (n.status ?? "idea") : "idea",
  });
  picking.value = null;
  if (date) tab.value = date;
}
function cycleStatus(n: Note) {
  const next: Record<string, Note["status"]> = { idea: "fixed", fixed: "done", done: "idea" };
  store.update(n.id, { status: next[n.status ?? "idea"] });
}
function setTime(n: Note, e: Event) {
  store.update(n.id, { time: (e.target as HTMLInputElement).value || undefined });
}
function setIntro(date: string, e: Event) {
  store.setIntro(date, (e.target as HTMLTextAreaElement).value);
}

/** Mock of "Claude、下書きを作って": in the real app this comes back from the Worker. */
function askClaude(date: string) {
  const items = store.forDay(date);
  const lines = items.map((n, i) =>
    `${["10:00", "12:30", "16:00", "20:30"][i] ?? ""} ${n.title}`.trim(),
  );
  draft.value = { date, lines };
}
function exportNote() {
  window.alert("本番では /r/<room>/shiori に静的ページとして書き出します");
}

function adoptDraft() {
  if (!draft.value) return;
  const items = store.forDay(draft.value.date);
  draft.value.lines.forEach((l, i) => {
    const t = l.match(/^\d\d:\d\d/)?.[0];
    if (t && items[i]) store.update(items[i].id, { time: t, status: "fixed" });
  });
  store.setIntro(
    draft.value.date,
    store.days.find((d) => d.date === draft.value!.date)?.intro ||
      "この日は昼に小籠包、夕方から九份。夜は信義でビール。",
  );
  draft.value = null;
}
</script>

<template>
  <div class="shiori">
    <header class="head">
      <h1>しおり</h1>
      <p class="sum">{{ short(store.days[0].date) }} 〜 {{ short(store.days.at(-1)!.date) }} · 確定 {{ fixedCount }} 件 · {{ yen(totalFixed) }}<small v-if="totalAll > totalFixed">（候補込み {{ yen(totalAll) }}）</small></p>
      <div aria-label="モード" class="mode" role="group">
        <button :class="{ on: editing }" @click="editing = true">編集</button>
        <button :class="{ on: !editing }" @click="editing = false">閲覧</button>
      </div>
    </header>

    <!-- tray: memos without a day (edit mode only) -->
    <section v-if="editing" class="tray">
      <div class="tray-head"><span>日付のないメモ · {{ store.unassigned.length }}</span><span class="muted">タップして日を決める</span></div>
      <div v-if="store.unassigned.length === 0" class="muted empty">全部に日付が付きました</div>
      <div v-else class="tray-row">
        <button
          v-for="n in store.unassigned"
          :key="n.id"
          class="tray-card"
          :class="{ picking: picking?.id === n.id }"
          :style="`background:${n.color}`"
          @click="picking = picking?.id === n.id ? null : n"
        >
          <span class="t">{{ n.title }}</span>
          <span class="tags"><span v-for="t in n.tags" :key="t" :style="`color:${store.tagColor(t)}`">#{{ t }}</span></span>
        </button>
      </div>
      <div v-if="picking" class="pick">
        <span class="pick-label">「{{ picking.title }}」は</span>
        <button v-for="d in store.days" :key="d.date" @click="assign(picking!, d.date)">{{ short(d.date) }}</button>
        <button class="later" @click="picking = null">あとで</button>
      </div>
    </section>

    <nav class="tabs">
      <button
        v-for="d in store.days"
        :key="d.date"
        :class="{ on: tab === d.date }"
        @click="tab = d.date"
      >{{ short(d.date) }}</button>
      <button :class="{ on: tab === 'appendix' }" @click="tab = 'appendix'">付録</button>
    </nav>

    <main class="body">
      <!-- ---------- a day ---------- -->
      <template v-if="tab !== 'appendix'">
        <h2 class="day">{{ dayIndex(tab) }}日目 <span>{{ fmt(tab) }}</span></h2>

        <template v-if="editing">
          <textarea
            class="intro"
            placeholder="この日のひとこと（しおりの冒頭に載ります）"
            rows="2"
            :value="store.days.find((d) => d.date === tab)?.intro"
            @change="setIntro(tab, $event)"
          ></textarea>
        </template>
        <p v-else-if="store.days.find((d) => d.date === tab)?.intro" class="intro-read">{{ store.days.find((d) => d.date === tab)?.intro }}</p>

        <p v-if="store.forDay(tab).length === 0" class="muted empty">まだ何もありません。上の「日付のないメモ」から入れてください。</p>

        <ol class="items">
          <li v-for="n in store.forDay(tab)" :key="n.id" class="item" :class="n.status">
            <template v-if="editing">
              <input class="time" type="time" :value="n.time ?? ''" @change="setTime(n, $event)">
              <div class="main">
                <p class="t">{{ n.title }}</p>
                <p v-if="n.body" class="b">{{ n.body }}</p>
                <div class="row">
                  <button class="status" :class="n.status" @click="cycleStatus(n)">{{ STATUS[n.status ?? "idea"] }}</button>
                  <span v-if="n.budget" class="muted">{{ yen(n.budget) }}</span>
                  <button class="unassign" @click="assign(n, null)">日付を外す</button>
                </div>
              </div>
            </template>
            <template v-else-if="n.status !== 'idea'">
              <span class="time-read">{{ n.time ?? "いつでも" }}</span>
              <div class="main">
                <p class="t">{{ n.title }}</p>
                <p class="meta"><span v-if="n.body">{{ n.body }}</span><span v-if="n.budget"> · {{ yen(n.budget) }}</span><a v-if="n.mapsUrl" :href="n.mapsUrl" rel="noopener" target="_blank"> · 地図</a></p>
              </div>
            </template>
          </li>
        </ol>

        <!-- read mode: candidates at the end of the day -->
        <template v-if="!editing && store.forDay(tab, 'idea').length">
          <h3 class="maybe">余裕があれば</h3>
          <ul class="maybe-list"><li v-for="n in store.forDay(tab, 'idea')" :key="n.id">{{ n.title }}<span v-if="n.budget" class="muted"> · {{ yen(n.budget) }}</span></li></ul>
        </template>

        <!-- Claude draft (edit mode) -->
        <template v-if="editing && store.forDay(tab).length">
          <div v-if="draft && draft.date === tab" class="claude">
            <div class="h"><svg aria-hidden="true" fill="#D97757" height="14" viewBox="0 0 24 24" width="14"><path d="M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z" /></svg>Claude<small>下書き</small></div>
            <p>位置関係と営業時間から、この順がいちばん歩かずに済みます。</p>
            <ol><li v-for="l in draft.lines" :key="l">{{ l }}</li></ol>
            <div class="act"><button class="ok" @click="adoptDraft">時間と確定を書き込む</button><button class="no" @click="draft = null">消す</button></div>
          </div>
          <button v-else class="ask" @click="askClaude(tab)">
            <svg aria-hidden="true" fill="#D97757" height="14" viewBox="0 0 24 24" width="14"><path d="M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z" /></svg>
            Claude に順番と時間の下書きを頼む
          </button>
        </template>

        <p v-if="store.budgetOf(tab)" class="daytotal">この日の予算 {{ yen(store.budgetOf(tab)) }}<small v-if="store.budgetOf(tab, false) > store.budgetOf(tab)">（候補込み {{ yen(store.budgetOf(tab, false)) }}）</small></p>
      </template>

      <!-- ---------- appendix ---------- -->
      <template v-else>
        <section v-for="t in APPENDIX_TAGS" :key="t" class="appendix">
          <h2 class="day" :style="`color:${store.tagColor(t)}`">#{{ t }}</h2>
          <ul class="check"><li v-for="n in store.byTag(t)" :key="n.id"><label><input type="checkbox">{{ n.title }}<span v-if="n.body" class="muted"> — {{ n.body }}</span></label></li></ul>
          <p v-if="store.byTag(t).length === 0" class="muted">このタグのメモはまだありません</p>
        </section>
      </template>
    </main>

    <footer v-if="!editing" class="foot">
      <button class="export" @click="exportNote">書き出す</button>
    </footer>
  </div>
</template>

<style scoped>
.shiori {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg);
}

.head {
  padding: calc(12px + env(safe-area-inset-top, 0px)) 16px 8px;
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 2px 10px;
  align-items: center;
}

h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 900;
  color: var(--red);
}

.sum {
  margin: 0;
  grid-column: 1 / -1;
  font-size: 13px;
  color: var(--muted);
}

.sum small {
  font-size: 12px;
}

.mode {
  display: flex;
  background: var(--surface);
  border: 1.5px solid var(--line);
  border-radius: 999px;
  padding: 3px;
}

.mode button {
  min-height: 30px;
  padding: 0 12px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 700;
  color: var(--muted);
}

.mode button.on {
  background: var(--ink);
  color: var(--bg);
}

.muted {
  color: var(--muted);
  font-size: 13px;
}

.empty {
  padding: 14px 0;
}

.tray {
  padding: 6px 16px 10px;
  border-bottom: 1.5px solid var(--line);
  background: color-mix(in srgb, var(--surface) 60%, var(--bg));
}

.tray-head {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  font-weight: 700;
  margin-bottom: 6px;
}

.tray-row {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  scrollbar-width: none;
  padding: 4px 0 6px;
}

.tray-row::-webkit-scrollbar {
  display: none;
}

.tray-card {
  flex-shrink: 0;
  width: 140px;
  text-align: left;
  padding: 8px 10px;
  border-radius: 6px;
  color: #1c2238;
  box-shadow: 0 2px 6px rgba(28,34,56,.14);
  display: flex;
  flex-direction: column;
  gap: 2px;
  border: 2px solid transparent;
}

.tray-card.picking {
  border-color: var(--ink);
}

.tray-card .t {
  font-size: 13px;
  font-weight: 700;
  line-height: 1.35;
}

.tray-card .tags {
  font-size: 11px;
  font-weight: 700;
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.pick {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  padding-top: 6px;
}

.pick-label {
  font-size: 13px;
  font-weight: 700;
  margin-right: 4px;
}

.pick button {
  min-height: 36px;
  padding: 0 12px;
  border-radius: 999px;
  background: var(--ink);
  color: var(--bg);
  font-size: 13px;
  font-weight: 700;
}

.pick .later {
  background: transparent;
  color: var(--muted);
  border: 1.5px solid var(--line);
}

.tabs {
  display: flex;
  gap: 4px;
  padding: 8px 16px;
  overflow-x: auto;
  scrollbar-width: none;
}

.tabs button {
  flex-shrink: 0;
  min-height: 36px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1.5px solid var(--line);
  background: var(--surface);
  font-size: 13px;
  font-weight: 700;
  color: var(--muted);
}

.tabs button.on {
  background: var(--red);
  color: #fff;
  border-color: transparent;
}

.body {
  flex: 1;
  overflow-y: auto;
  padding: 4px 16px 24px;
}

.day {
  margin: 8px 0 10px;
  font-size: 18px;
  font-weight: 900;
}

.day span {
  font-size: 14px;
  font-weight: 700;
  color: var(--muted);
  margin-left: 8px;
}

.intro {
  width: 100%;
  font: inherit;
  font-size: 14px;
  padding: 10px 12px;
  border: 1.5px dashed var(--line);
  border-radius: 12px;
  background: var(--surface);
  color: var(--ink);
  resize: none;
  margin-bottom: 10px;
}

.intro-read {
  margin: 0 0 12px;
  font-size: 15px;
  line-height: 1.7;
}

.items {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.item {
  display: flex;
  gap: 10px;
  padding: 10px 12px;
  background: var(--surface);
  border: 1.5px solid var(--line);
  border-radius: 14px;
}

.item.fixed {
  border-color: var(--gold);
}

.item.done {
  opacity: .5;
}

.item .main {
  flex: 1;
  min-width: 0;
}

.item .t {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  line-height: 1.4;
}

.item .b, .item .meta {
  margin: 2px 0 0;
  font-size: 13px;
  color: var(--muted);
}

.item .meta a {
  color: var(--jade);
  font-weight: 700;
  text-decoration: none;
}

.item .row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-top: 6px;
}

.time {
  width: 86px;
  flex-shrink: 0;
  font: inherit;
  font-size: 14px;
  font-weight: 700;
  padding: 4px 6px;
  border: 1.5px solid var(--line);
  border-radius: 8px;
  background: var(--bg);
  color: var(--ink);
  align-self: flex-start;
}

.time-read {
  width: 56px;
  flex-shrink: 0;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--muted);
  font-size: 14px;
  padding-top: 1px;
}

.status {
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  background: var(--line);
}

.status.fixed {
  background: var(--gold);
  color: #fff;
}

.status.done {
  background: var(--jade);
  color: #fff;
}

.unassign {
  margin-left: auto;
  font-size: 12px;
  color: var(--muted);
}

.maybe {
  margin: 18px 0 6px;
  font-size: 14px;
  color: var(--muted);
}

.maybe-list {
  margin: 0;
  padding-left: 18px;
  font-size: 14px;
  color: var(--muted);
}

.daytotal {
  margin: 16px 0 0;
  text-align: right;
  font-size: 14px;
  font-weight: 700;
}

.daytotal small {
  font-weight: 400;
  color: var(--muted);
}

.ask {
  margin-top: 14px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 40px;
  padding: 0 14px;
  border-radius: 999px;
  background: var(--ivory);
  border: 1px solid var(--oat);
  color: var(--slate);
  font-size: 13px;
  font-family: system-ui, sans-serif;
}

.claude {
  margin-top: 14px;
  padding: 12px 14px;
  border-radius: 12px;
  background: var(--ivory);
  border: 1px solid var(--oat);
  color: var(--slate);
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
}

.claude .h {
  display: flex;
  align-items: center;
  gap: 5px;
  font-family: Georgia, serif;
  font-size: 15px;
  margin-bottom: 4px;
}

.claude .h small {
  margin-left: auto;
  font-family: system-ui, sans-serif;
  font-size: 11px;
  color: #73726C;
}

.claude p {
  margin: 0 0 6px;
  font-size: 14px;
  line-height: 1.5;
}

.claude ol {
  margin: 0 0 8px;
  padding-left: 20px;
  font-size: 14px;
}

.claude .act {
  display: flex;
  gap: 6px;
}

.claude .act button {
  min-height: 34px;
  padding: 0 12px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 600;
}

.claude .act .ok {
  background: var(--clay);
  color: #fff;
}

.claude .act .no {
  border: .5px solid rgba(31,30,29,.3);
}

.appendix + .appendix {
  margin-top: 18px;
}

.check {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.check label {
  display: flex;
  gap: 10px;
  align-items: baseline;
  padding: 10px 12px;
  background: var(--surface);
  border: 1.5px solid var(--line);
  border-radius: 12px;
  font-size: 15px;
}

.check input {
  width: 20px;
  height: 20px;
  accent-color: var(--jade);
}

.foot {
  padding: 10px 16px 12px;
  border-top: 1.5px solid var(--line);
  background: var(--bg);
}

.export {
  width: 100%;
  height: 48px;
  border-radius: 999px;
  background: var(--ink);
  color: var(--bg);
  font-size: 15px;
  font-weight: 700;
}
</style>
