<script lang="ts">
import { setWorkerUrl } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

// MapLibre looks for its worker next to its own module, which bundling moves away from.
// Let Vite bundle the worker (it imports maplibre-gl-shared.mjs) and say where it is.
setWorkerUrl(workerUrl);
</script>

<script setup lang="ts" vapor>
import type { Temporal } from "temporal-polyfill-lite";

import { computed, onBeforeUnmount, onMounted, ref, watch, watchEffect, useTemplateRef } from "vue";

import * as maplibregl from "maplibre-gl";
import { Map as MLMap, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { CtAppBar, CtChip, CtChipRow, CtFab } from "../../ui/index";

import { formatMoney } from "../shared/money";

import { useI18n } from "../i18n/useI18n";

import { PAPERS, type Memo, type Note } from "../features/notes/types";
import { useNotes } from "../features/notes/useNotes";
import { placeLink, safeUrl } from "../features/place/google-maps";
import { lngLat, needsPin, pinnedOf, type Pinned } from "../features/place/pin";
import { boundsOf, routeLine, routeStops } from "../features/place/route";
import type { LatLng } from "../features/place/types";
import { useTags } from "../features/tags/useTags";
import { hhmm, shortDate } from "../features/trip/format";
import { useTrip } from "../features/trip/useTrip";
import closeIcon from "../icons/close.svg";
import Icon from "../icons/Icon.vue";
import plusIcon from "../icons/plus.svg";

/** `write` carries the long-pressed place, or null from the stamp: a note with no place yet */
const emit = defineEmits<{ write: [pin: LatLng | null]; edit: [note: Memo] }>();
const store = useNotes();
const tags = useTags();
const trip = useTrip();
const i18n = useI18n();
const price = (amount: number) => formatMoney(amount, trip.currency, i18n.locale);
const short = (date: Temporal.PlainDate) => shortDate(date, i18n.locale);
const el = useTemplateRef<HTMLElement>("el");
/** The pin whose card is open, by id: the note object is replaced whenever it changes */
const selectedId = ref<string | null>(null);
const selected = computed(
  (): Pinned | null => pinnedOf(store.notes).find((n) => n.id === selectedId.value) ?? null,
);
const day = ref<Temporal.PlainDate | null>(null); // show a day's route
const isDay = (date: Temporal.PlainDate) => day.value?.equals(date) ?? false;
const toggleDay = (date: Temporal.PlainDate) => (day.value = isDay(date) ? null : date);
const noPin = computed(() => store.notes.filter(needsPin).length);
const showAllDays = () => (day.value = null);
const closeCard = () => (selectedId.value = null);
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
      // the paper's ink (MapLibre paints with a literal color, not a CSS variable); the tiles are light in both themes
      paint: { "line-color": "#24272e", "line-width": 3, "line-dasharray": [1.5, 1.5] },
    });
    syncMarkers();
    syncRoute();
  });
  map.on("click", () => (selectedId.value = null));

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
  const dot = document.createElement("span"),
    lbl = document.createElement("span");
  dot.className = "dot";
  lbl.className = "lbl";
  lbl.textContent = n.title;
  d.append(dot, lbl);
  d.addEventListener("click", (e) => {
    e.stopPropagation();
    selectedId.value = n.id;
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
    // the pin is the note's own paper, so a card on the desk and its pin are told apart by nothing
    e.style.setProperty("--pin", PAPERS[n.color]);
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
      padding: { top: 60, bottom: 160, left: 40, right: 40 },
      duration: 500,
      maxZoom: 14,
    });
  }
}
// re-sync whenever notes, filter or selection change (cheap: a dozen DOM toggles)
watchEffect(() => {
  void pinnedOf(store.notes).map((n) => [n.pin.lat, n.pin.lng, n.title, n.color, n.tags.length]);
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
  <section>
    <CtAppBar>
      <CtChipRow>
        <CtChip :selected="day === null" @click="showAllDays">{{ i18n.t("map.all") }}</CtChip>
        <CtChip
          v-for="d in trip.days"
          :key="d.date.toString()"
          :selected="isDay(d.date)"
          @click="() => toggleDay(d.date)"
        >{{ i18n.t("map.route", { date: short(d.date) }) }}</CtChip>
      </CtChipRow>
    </CtAppBar>

    <div>
      <div ref="el"></div>

      <div class="top">
        <!-- the desk's filter follows the pins here, and can be cleared here -->
        <div v-if="tags.selected.size">
          <CtChip class="clear" @click="() => tags.selected.clear()">{{ i18n.t("filter.clear") }}</CtChip>
          <CtChip
            v-for="t in tags.tagList.filter((x) => tags.selected.has(x.name))"
            :key="t.name"
            selected
            toggle
            @click="() => tags.toggleTag(t.name)"
          >#{{ t.name }}</CtChip>
        </div>
        <p v-if="noPin">{{ i18n.t("map.noPin", { count: noPin }) }}</p>
      </div>

      <div class="jump"><button type="button" @click="fitAll">{{ i18n.t("common.fitAll") }}</button></div>

      <!-- the same write button as the canvas: writing is never more than a tap away -->
      <CtFab :label="i18n.t('canvas.write')" @click="() => emit('write', null)"><Icon :size="24" :src="plusIcon" /></CtFab>

      <article v-if="selected" :style="`--card:${PAPERS[selected.color]}`">
        <h2>{{ selected.title }}</h2>
        <p v-if="selected.body">{{ selected.body }}</p>
        <footer>
          <span v-for="t in selected.tags" :key="t">#{{ t }} </span>
          <span v-if="selected.budget">{{ price(selected.budget) }} </span>
          <span v-if="selected.schedule">{{ short(selected.schedule.date) }} {{ selected.schedule.time ? hhmm(selected.schedule.time) : "" }}</span>
        </footer>
        <div>
          <a :href="safeUrl(selectedLink)" rel="noopener noreferrer" target="_blank">{{ i18n.t("map.openInGoogleMaps") }}</a>
          <button type="button" @click="editSelected">{{ i18n.t("common.edit") }}</button>
          <button type="button" :aria-label="i18n.t('common.close')" @click="closeCard"><Icon :size="18" :src="closeIcon" /></button>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
section {
  position: absolute;
  inset: 0;
  isolation: isolate;
  display: flex;
  flex-direction: column;
  background: var(--bg);

  /* marker elements are built with innerHTML inside the map container */
  :deep(.pin) {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    background: none;
    border: 0;
    padding: 0;
    cursor: pointer;
    transition: opacity .2s;

    > .dot {
      width: 18px;
      height: 18px;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      background: var(--pin);
      border: 2px solid var(--paper-ink);
      box-shadow: 0 2px 6px rgb(17 19 24 / 0.3);
    }

    > .lbl {
      max-width: 168px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: var(--font-2xs);
      font-weight: 700;
      color: var(--paper-ink);
      background: rgb(255 255 255 / 0.92);
      padding: 1px 6px;
      border-radius: 999px;
      box-shadow: 0 1px 2px rgb(17 19 24 / 0.12);
    }

    &.on > .dot {
      transform: rotate(-45deg) scale(1.3);
    }

    /* the children fade, not the marker: MapLibre writes its own inline opacity on the marker root */
    &.dim {
      pointer-events: none;

      > .dot,
      > .lbl {
        opacity: .25;
      }
    }
  }

  /* the geolocate button stacks above the write button */
  :deep(.maplibregl-ctrl-bottom-right) {
    inset-block-end: 72px;
  }

  /* MapLibre's own buttons (geolocate, the compact attribution) at the same 36px as every other tool */
  :deep(.maplibregl-ctrl-group button),
  :deep(.maplibregl-ctrl-attrib-button) {
    width: var(--tap);
    height: var(--tap);
  }

  /* the attribution would sit under the fit button otherwise */
  :deep(.maplibregl-ctrl-bottom-left) {
    inset-block-end: 76px;
  }

  /* everything under the bar: the map and what floats on it */
  > div {
    position: relative;
    flex: 1;
    min-height: 0;

    /* the map itself: MapLibre's container */
    > div:first-child {
      position: absolute;
      inset: 0;
    }

    > .top {
      position: absolute;
      inset-inline: 0;
      inset-block-start: 0;
      z-index: var(--z-float);
      padding: 10px 16px 0;
      pointer-events: none;
      display: flex;
      flex-direction: column;
      gap: 6px;

      > * {
        pointer-events: auto;
      }

      /* the filter */
      > div {
        display: flex;
        gap: 6px;
        overflow-x: auto;
        scrollbar-width: none;
        padding: 2px 24px 8px 2px;
        margin-inline: -2px;
        mask-image: linear-gradient(to right, #000 calc(100% - 28px), transparent);

        &::-webkit-scrollbar {
          display: none;
        }

        > .clear {
          border-style: dashed;
        }
      }

      /* the notes with no place yet */
      > p {
        margin: 0;
        align-self: flex-start;
        font-size: var(--font-xs);
        color: var(--ink);
        background: var(--surface);
        border: 1px solid var(--line);
        border-radius: 999px;
        padding: 4px 10px;
        box-shadow: var(--shadow-tool);
      }
    }

    /* level with the write button's middle, as on the desk */
    > .jump {
      position: absolute;
      inset-inline-start: 16px;
      inset-block-end: 24px;
      z-index: var(--z-float);

      > button {
        min-height: 40px;
        padding: 0 14px;
        border-radius: 999px;
        background: var(--surface);
        border: 1px solid var(--line);
        box-shadow: var(--shadow-tool);
        font-size: var(--font-sm);
        font-weight: 700;
        color: var(--muted);
      }
    }

    /* the open pin's card */
    > article {
      position: absolute;
      inset-inline: 12px;
      inset-block-end: 88px;
      z-index: var(--z-float-top);
      padding: 12px 14px;
      border-radius: 14px;
      background: var(--surface);
      border: 1px solid var(--line);
      box-shadow: var(--shadow-float);

      > h2 {
        margin: 0;
        font-size: var(--font-lg);
        font-weight: 700;
        display: flex;
        align-items: center;
        gap: 8px;

        /* the note's paper, as a swatch rather than a stripe */
        &::before {
          content: "";
          flex-shrink: 0;
          width: 12px;
          height: 12px;
          border-radius: 3px;
          background: var(--card);
          box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--paper-ink) 14%, transparent);
        }
      }

      > p {
        margin: 2px 0 0;
        font-size: var(--font-sm);
        color: var(--muted);
      }

      /* tags, budget, when */
      > footer {
        margin: 4px 0 0;
        font-size: var(--font-xs);
        font-weight: 700;
        color: var(--muted);
        display: flex;
        flex-wrap: wrap;
        gap: 0 8px;
      }

      /* the actions */
      > div {
        display: flex;
        align-items: center;
        gap: 4px;
        margin-top: 6px;
        font-size: var(--font-sm);
        font-weight: 700;

        > a,
        > button {
          min-height: var(--tap);
          padding: 0 8px;
          display: inline-flex;
          align-items: center;
          border-radius: 10px;
        }

        > a {
          color: var(--ink);
          text-decoration: underline;
          text-underline-offset: 3px;
        }

        /* close */
        > button:last-child {
          margin-inline-start: auto;
          width: var(--tap);
          justify-content: center;
          color: var(--muted);
        }
      }
    }
  }
}
</style>
