<script setup lang="ts" vapor>
import { computed, onBeforeUnmount, onMounted, ref, watch, watchEffect, useTemplateRef } from "vue";
import * as maplibregl from "maplibre-gl";
import { Map as MLMap, Marker } from "maplibre-gl";
import type { Temporal } from "temporal-polyfill-lite";
import "maplibre-gl/dist/maplibre-gl.css";
import { useNotes } from "@/features/notes/store";
import { useMembers } from "@/features/members/store";
import type { Memo, Note } from "@/features/notes/types";
import { useTags } from "@/features/tags/store";
import { useTrip } from "@/features/trip/store";
import { hhmm, money, shortDate } from "@/features/trip/format";
import { placeLink, safeUrl } from "@/features/place/google-maps";
import { lngLat, needsPin, pinnedOf, type Pinned } from "@/features/place/pin";
import { boundsOf, routeLine, routeStops } from "@/features/place/route";
import type { LatLng } from "@/features/place/types";

const emit = defineEmits<{ write: [pin: LatLng]; edit: [note: Memo] }>();
const store = useNotes();
const tags = useTags();
const trip = useTrip();
const members = useMembers();
const price = (amount: number) => money(amount, trip.currency);
const el = useTemplateRef<HTMLElement>("el");
const selected = ref<Pinned | null>(null);
const day = ref<Temporal.PlainDate | null>(null); // show a day's route
const isDay = (date: Temporal.PlainDate) => day.value?.equals(date) ?? false;
const toggleDay = (date: Temporal.PlainDate) => (day.value = isDay(date) ? null : date);
const noPin = computed(() => store.notes.filter(needsPin).length);
const showAllDays = () => (day.value = null);
const closeCard = () => (selected.value = null);
const editSelected = () => {
  if (selected.value) emit("edit", selected.value);
};
const selectedLink = computed(() => (selected.value ? placeLink(selected.value) : null));

// free vector tiles, no key. Swap the style URL for your own if you self-host.
const STYLE = "https://tiles.openfreemap.org/styles/liberty";

let map: MLMap | null = null;
const markers = new Map<string, Marker>();

onMounted(() => {
  map = new MLMap({
    container: el.value!,
    style: STYLE,
    // the trip's area; the whole world until the room says where we are going
    center: trip.center ? [trip.center.lng, trip.center.lat] : [0, 0],
    zoom: trip.center ? 11.5 : 1,
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
    map!.addSource("route", { type: "geojson", data: routeLine([]) });
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

function pinEl(n: Pinned) {
  const d = document.createElement("button");
  d.type = "button";
  d.className = "pin";
  d.setAttribute("aria-label", n.title);
  d.style.setProperty("--pin", n.tags[0] ? tags.tagColor(n.tags[0]) : members.colorOf(n.by));
  const dot = document.createElement("span"),
    lbl = document.createElement("span");
  dot.className = "dot";
  lbl.className = "lbl";
  lbl.textContent = n.title;
  d.append(dot, lbl);
  d.addEventListener("click", (e) => {
    e.stopPropagation();
    selected.value = n;
    map?.easeTo({ center: lngLat(n.pin), duration: 300 });
  });
  return d;
}

function syncMarkers() {
  if (!map) return;
  const seen = new Set<string>();
  for (const n of pinnedOf(store.notes)) {
    seen.add(n.id);
    let m = markers.get(n.id);
    if (!m) {
      m = new Marker({ element: pinEl(n), anchor: "bottom" }).setLngLat(lngLat(n.pin)).addTo(map);
      markers.set(n.id, m);
    } else m.setLngLat(lngLat(n.pin));
    const e = m.getElement();
    const visibility = tags.visibility(n);
    e.classList.toggle("dim", visibility === "dimmed");
    e.style.display = visibility === "hidden" ? "none" : "";
    e.classList.toggle("on", selected.value?.id === n.id);
    e.querySelector(".lbl")!.textContent = n.title;
  }
  for (const [id, m] of markers)
    if (!seen.has(id)) {
      m.remove();
      markers.delete(id);
    }
}
function syncRoute() {
  if (!map?.getSource("route")) return;
  const src = map.getSource("route") as maplibregl.GeoJSONSource;
  const stops = day.value ? routeStops(trip.forDay(day.value)) : [];
  src.setData(routeLine(stops));
  const b = boundsOf(stops);
  if (b) {
    map.fitBounds(b, {
      padding: { top: 140, bottom: 160, left: 40, right: 40 },
      duration: 500,
      maxZoom: 14,
    });
  }
}
// re-sync whenever notes, filter or selection change (cheap: a dozen DOM toggles)
watchEffect(() => {
  void pinnedOf(store.notes).map((n) => [n.pin.lat, n.pin.lng, n.title, n.tags.length]);
  void tags.mode;
  void [...tags.selected];
  void selected.value;
  syncMarkers();
});
const scheduleKey = (n: Note) =>
  n.kind === "memo" && n.schedule
    ? `${n.schedule.date} ${n.schedule.time} ${n.schedule.status}`
    : "";
watch([day, () => store.notes.map(scheduleKey)], syncRoute);

function fitAll() {
  const b = boundsOf(pinnedOf(store.notes).map((n) => lngLat(n.pin)));
  if (b) map?.fitBounds(b, { padding: 80, duration: 500 });
}
</script>

<template>
  <div class="mapview">
    <div ref="el" class="map"></div>

    <div class="top">
      <div class="days">
        <button type="button" :class="{ on: day === null }" @click="showAllDays">All</button>
        <button
          v-for="d in trip.days"
          :key="d.date.toString()"
          type="button"
          :class="{ on: isDay(d.date) }"
          @click="() => toggleDay(d.date)"
        >Route {{ shortDate(d.date) }}</button>
      </div>
      <p v-if="noPin" class="nopin">{{ noPin }} {{ noPin === 1 ? "note has" : "notes have" }} no place · long-press the map to place</p>
    </div>

    <div class="jump"><button type="button" @click="fitAll">Fit all</button></div>

    <div v-if="selected" class="card" :style="`--card:${selected.color}`">
      <p class="t">{{ selected.title }}</p>
      <p v-if="selected.body" class="b">{{ selected.body }}</p>
      <p class="meta">
        <span v-for="t in selected.tags" :key="t" :style="`color:${tags.tagColor(t)}`">#{{ t }} </span>
        <span v-if="selected.budget">{{ price(selected.budget) }} </span>
        <span v-if="selected.schedule">{{ shortDate(selected.schedule.date) }} {{ selected.schedule.time ? hhmm(selected.schedule.time) : "" }}</span>
      </p>
      <div class="act">
        <a :href="safeUrl(selectedLink)" rel="noopener noreferrer" target="_blank">Open in Google Maps</a>
        <button type="button" @click="editSelected">Edit</button>
        <button aria-label="Close" class="x" type="button" @click="closeCard">×</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mapview {
  position: absolute;
  inset: 0;
  isolation: isolate;

  /* marker elements are built with innerHTML inside the map container */
  & :deep(.pin) {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    background: none;
    border: 0;
    padding: 0;
    cursor: pointer;
    transition: opacity .2s;

    & .dot {
      width: 18px;
      height: 18px;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      background: var(--pin);
      border: 2.5px solid var(--on-accent);
      box-shadow: 0 2px 6px rgba(0,0,0,.3);
    }

    & .lbl {
      max-width: 120px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: var(--font-2xs);
      font-weight: 700;
      color: var(--paper-ink);
      background: rgba(255,255,255,.9);
      padding: 1px 6px;
      border-radius: 999px;
    }

    &.on .dot {
      transform: rotate(-45deg) scale(1.3);
    }

    &.dim {
      opacity: .25;
      pointer-events: none;
    }
  }

  & :deep(.maplibregl-ctrl-bottom-right) {
    inset-block-end: 24px;
  }
}

.map {
  position: absolute;
  inset: 0;
}

.top {
  position: absolute;
  inset-inline: 0;
  inset-block-start: 0;
  z-index: var(--z-float);
  padding: calc(10px + env(safe-area-inset-top, 0px)) 12px 0;
  pointer-events: none;
  display: flex;
  flex-direction: column;
  gap: 6px;

  & > * {
    pointer-events: auto;
  }
}

.days {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }

  & button {
    flex-shrink: 0;
    min-height: 36px;
    padding: 0 12px;
    border-radius: 999px;
    border: 1.5px solid var(--line);
    background: var(--surface);
    font-size: var(--font-sm);
    font-weight: 700;
    color: var(--muted);

    &.on {
      background: var(--red);
      color: var(--on-accent);
      border-color: transparent;
    }
  }
}

.nopin {
  margin: 0;
  align-self: flex-start;
  font-size: var(--font-xs);
  color: var(--ink);
  background: var(--surface);
  border: 1.5px solid var(--line);
  border-radius: 999px;
  padding: 4px 10px;
}

.jump {
  position: absolute;
  inset-inline-start: 16px;
  inset-block-end: 28px;
  z-index: var(--z-float);

  & button {
    min-height: 40px;
    padding: 0 14px;
    border-radius: 999px;
    background: var(--surface);
    border: 1.5px solid var(--line);
    font-size: var(--font-sm);
    font-weight: 700;
  }
}

.card {
  position: absolute;
  inset-inline: 12px;
  inset-block-end: 80px;
  z-index: var(--z-float-top);
  padding: 12px 14px;
  border-radius: 14px;
  background: var(--surface);
  border: 1.5px solid var(--line);
  border-left: 6px solid var(--card);
  box-shadow: 0 8px 20px rgba(28,34,56,.2);

  & .t {
    margin: 0;
    font-size: var(--font-lg);
    font-weight: 700;
  }

  & .b {
    margin: 2px 0 0;
    font-size: var(--font-sm);
    color: var(--muted);
  }

  & .meta {
    margin: 4px 0 0;
    font-size: var(--font-xs);
    font-weight: 700;
    color: var(--muted);
  }

  & .act {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 8px;
    font-size: var(--font-sm);
    font-weight: 700;

    & a {
      color: var(--jade);
      text-decoration: none;
    }

    & .x {
      margin-inline-start: auto;
      font-size: var(--font-2xl);
      color: var(--muted);
    }
  }
}
</style>
