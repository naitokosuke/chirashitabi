<script setup lang="ts" vapor>
import { onBeforeUnmount, onMounted, ref, watch, watchEffect, useTemplateRef } from "vue";
import * as maplibregl from "maplibre-gl";
import { Map as MLMap, Marker } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";
import { useNotes } from "@/notes/store";
import { MEMBERS, type Note } from "@/notes/types";
import { googleMapsLink } from "./google-maps";

const emit = defineEmits<{ write: [at: { lat: number; lng: number }]; edit: [note: Note] }>();
const store = useNotes();
const el = useTemplateRef<HTMLElement>("el");
const selected = ref<Note | null>(null);
const day = ref<string | null>(null); // show a day's route
const noPin = ref(0);

// free vector tiles, no key. Swap the style URL for your own if you self-host.
const STYLE = "https://tiles.openfreemap.org/styles/liberty";
const TAIPEI: [number, number] = [121.54, 25.05];

let map: MLMap | null = null;
const markers = new Map<string, Marker>();

onMounted(() => {
  map = new MLMap({
    container: el.value!,
    style: STYLE,
    center: TAIPEI,
    zoom: 11.5,
    attributionControl: { compact: true },
  });
  map.addControl(
    new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: false,
    }),
    "bottom-right",
  );
  map.on("load", () => {
    map!.addSource("route", { type: "geojson", data: emptyLine() });
    map!.addLayer({
      id: "route",
      type: "line",
      source: "route",
      layout: { "line-join": "round", "line-cap": "round" },
      paint: { "line-color": "#d7263d", "line-width": 3, "line-dasharray": [1.5, 1.5] },
    });
    syncMarkers();
    syncRoute();
  });
  map.on("click", () => (selected.value = null));

  // long press on the map = new memo pinned here
  let t: number | undefined,
    start: { x: number; y: number } | null = null;
  map.on("touchstart", (e) => {
    if (e.originalEvent.touches.length !== 1) return;
    start = { x: e.point.x, y: e.point.y };
    t = window.setTimeout(() => {
      navigator.vibrate?.(10);
      emit("write", { lat: e.lngLat.lat, lng: e.lngLat.lng });
    }, 500);
  });
  map.on("touchmove", (e) => {
    if (start && Math.hypot(e.point.x - start.x, e.point.y - start.y) > 8) clearTimeout(t);
  });
  map.on("touchend", () => clearTimeout(t));
  map.on("contextmenu", (e) => emit("write", { lat: e.lngLat.lat, lng: e.lngLat.lng })); // desktop: right click
});
onBeforeUnmount(() => {
  markers.forEach((m) => m.remove());
  map?.remove();
  map = null;
});

function pinEl(n: Note) {
  const d = document.createElement("button");
  d.className = "pin";
  d.setAttribute("aria-label", n.title);
  d.style.setProperty(
    "--pin",
    n.kind === "claude"
      ? "#D97757"
      : n.tags[0]
        ? store.tagColor(n.tags[0])
        : (MEMBERS[n.by] ?? "#1c2238"),
  );
  d.innerHTML = `<span class="dot"></span><span class="lbl">${escapeHtml(n.title)}</span>`;
  d.addEventListener("click", (e) => {
    e.stopPropagation();
    selected.value = n;
    map?.easeTo({ center: [n.lng!, n.lat!], duration: 300 });
  });
  return d;
}
const escapeHtml = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function syncMarkers() {
  if (!map) return;
  const seen = new Set<string>();
  let missing = 0;
  for (const n of store.notes) {
    if (n.lat == null || n.lng == null) {
      if (n.kind === "note" && !n.tags.includes("持ち物")) missing++;
      continue;
    }
    seen.add(n.id);
    const visible = store.mode === "only" ? store.matches(n) : true;
    const dim = store.mode === "dim" && !store.matches(n);
    let m = markers.get(n.id);
    if (!m) {
      m = new Marker({ element: pinEl(n), anchor: "bottom" }).setLngLat([n.lng, n.lat]).addTo(map);
      markers.set(n.id, m);
    } else m.setLngLat([n.lng, n.lat]);
    const e = m.getElement();
    e.classList.toggle("dim", dim);
    e.classList.toggle("hide", !visible);
    e.classList.toggle("on", selected.value?.id === n.id);
    e.querySelector(".lbl")!.textContent = n.title;
  }
  for (const [id, m] of markers)
    if (!seen.has(id)) {
      m.remove();
      markers.delete(id);
    }
  noPin.value = missing;
}
const emptyLine = () => ({ type: "FeatureCollection", features: [] }) as FeatureCollection;
function syncRoute() {
  if (!map?.getSource("route")) return;
  const src = map.getSource("route") as maplibregl.GeoJSONSource;
  if (!day.value) {
    src.setData(emptyLine());
    return;
  }
  const pts = store
    .forDay(day.value)
    .filter((n) => n.status !== "idea" && n.lat != null)
    .map((n) => [n.lng!, n.lat!]);
  src.setData({
    type: "FeatureCollection",
    features:
      pts.length > 1
        ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: pts } }]
        : [],
  });
  if (pts.length) {
    const b = pts.reduce(
      (b, p) => b.extend(p as [number, number]),
      new maplibregl.LngLatBounds(pts[0] as [number, number], pts[0] as [number, number]),
    );
    map.fitBounds(b, {
      padding: { top: 140, bottom: 160, left: 40, right: 40 },
      duration: 500,
      maxZoom: 14,
    });
  }
}
// re-sync whenever notes, filter or selection change (cheap: a dozen DOM toggles)
watchEffect(() => {
  void store.notes.map((n) => [n.lat, n.lng, n.title, n.tags.length]);
  void store.mode;
  void [...store.selected];
  void selected.value;
  syncMarkers();
});
watch([day, () => store.notes.map((n) => n.time + (n.status ?? "") + n.date)], syncRoute);

const short = (date: string) =>
  new Date(date + "T00:00:00").toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
const yen = (n: number) => "NT$ " + n.toLocaleString("ja-JP");
function fitAll() {
  const pts = store.notes
    .filter((n) => n.lat != null)
    .map((n) => [n.lng!, n.lat!] as [number, number]);
  if (!pts.length || !map) return;
  map.fitBounds(
    pts.reduce((b, p) => b.extend(p), new maplibregl.LngLatBounds(pts[0], pts[0])),
    { padding: 80, duration: 500 },
  );
}
</script>

<template>
  <div class="mapview">
    <div ref="el" class="map"></div>

    <div class="top">
      <div class="days">
        <button :class="{ on: day === null }" @click="day = null">全部</button>
        <button
          v-for="d in store.days"
          :key="d.date"
          :class="{ on: day === d.date }"
          @click="day = day === d.date ? null : d.date"
        >{{ short(d.date) }}の道順</button>
      </div>
      <p v-if="noPin" class="nopin">場所が未設定のメモ {{ noPin }} 件 · 地図を長押しで置けます</p>
    </div>

    <div class="jump"><button @click="fitAll">全体</button></div>

    <div v-if="selected" class="card" :style="`--card:${selected.color}`">
      <p class="t">{{ selected.title }}</p>
      <p v-if="selected.body" class="b">{{ selected.body }}</p>
      <p class="meta">
        <span v-for="t in selected.tags" :key="t" :style="`color:${store.tagColor(t)}`">#{{ t }} </span>
        <span v-if="selected.budget">{{ yen(selected.budget) }} </span>
        <span v-if="selected.date">{{ short(selected.date) }} {{ selected.time ?? "" }}</span>
      </p>
      <div class="act">
        <a
          :href="selected.mapsUrl || googleMapsLink(selected.lat!, selected.lng!)"
          rel="noopener"
          target="_blank"
        >Google マップで開く</a>
        <button v-if="selected.kind !== 'claude'" @click="emit('edit', selected!)">編集</button>
        <button aria-label="閉じる" class="x" @click="selected = null">×</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mapview {
  position: absolute;
  inset: 0;
}

.map {
  position: absolute;
  inset: 0;
}

.top {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  z-index: 2;
  padding: calc(10px + env(safe-area-inset-top, 0px)) 12px 0;
  pointer-events: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.top > * {
  pointer-events: auto;
}

.days {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  scrollbar-width: none;
}

.days::-webkit-scrollbar {
  display: none;
}

.days button {
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

.days button.on {
  background: var(--red);
  color: #fff;
  border-color: transparent;
}

.nopin {
  margin: 0;
  align-self: flex-start;
  font-size: 12px;
  color: var(--ink);
  background: var(--surface);
  border: 1.5px solid var(--line);
  border-radius: 999px;
  padding: 4px 10px;
}

.jump {
  position: absolute;
  left: 16px;
  bottom: 28px;
  z-index: 2;
}

.jump button {
  min-height: 40px;
  padding: 0 14px;
  border-radius: 999px;
  background: var(--surface);
  border: 1.5px solid var(--line);
  font-size: 13px;
  font-weight: 700;
}

.card {
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: 80px;
  z-index: 3;
  padding: 12px 14px;
  border-radius: 14px;
  background: var(--surface);
  border: 1.5px solid var(--line);
  border-left: 6px solid var(--card);
  box-shadow: 0 8px 20px rgba(28,34,56,.2);
}

.card .t {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
}

.card .b {
  margin: 2px 0 0;
  font-size: 13px;
  color: var(--muted);
}

.card .meta {
  margin: 4px 0 0;
  font-size: 12px;
  font-weight: 700;
  color: var(--muted);
}

.card .act {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
  font-size: 13px;
  font-weight: 700;
}

.card .act a {
  color: var(--jade);
  text-decoration: none;
}

.card .act .x {
  margin-left: auto;
  font-size: 18px;
  color: var(--muted);
}
</style>

<style>
/* marker elements live outside the component root, so these are global */
.pin {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  background: none;
  border: 0;
  padding: 0;
  cursor: pointer;
  transition: opacity .2s;
}

.pin .dot {
  width: 18px;
  height: 18px;
  border-radius: 50% 50% 50% 0;
  transform: rotate(-45deg);
  background: var(--pin);
  border: 2.5px solid #fff;
  box-shadow: 0 2px 6px rgba(0,0,0,.3);
}

.pin .lbl {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  font-weight: 700;
  color: #1c2238;
  background: rgba(255,255,255,.9);
  padding: 1px 6px;
  border-radius: 999px;
}

.pin.on .dot {
  transform: rotate(-45deg) scale(1.3);
}

.pin.dim {
  opacity: .25;
  pointer-events: none;
}

.pin.hide {
  display: none;
}

.maplibregl-ctrl-bottom-right {
  bottom: 24px;
}
</style>
