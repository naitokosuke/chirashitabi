<script lang="ts">
import { setWorkerUrl } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

// MapLibre looks for its worker next to its own module, which bundling moves away from.
// Let Vite bundle the worker (it imports maplibre-gl-shared.mjs) and say where it is.
setWorkerUrl(workerUrl);
</script>

<script setup lang="ts" vapor>
import type { Temporal } from "temporal-polyfill-lite";

import {
  computed,
  onActivated,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  watchEffect,
  useTemplateRef,
} from "vue";

import * as maplibregl from "maplibre-gl";
import { Map as MLMap, Marker } from "maplibre-gl";
import { useRoute, useRouter } from "vue-router";
import "maplibre-gl/dist/maplibre-gl.css";

import {
  CtBadge,
  CtButton,
  CtChip,
  CtFab,
  CtHeading,
  CtHint,
  CtLink,
  CtPanel,
  CtScrollRow,
} from "../../../../ui/index";

import { formatMoney } from "../../../shared/money";

import { useI18n } from "../../../i18n/useI18n";

import type { Pt } from "../../../features/canvas/transform";
import { paperOf } from "../../../features/members/paper";
import { useMembers } from "../../../features/members/useMembers";
import type { NoteId } from "../../../features/notes/id";
import type { FormTarget, Note } from "../../../features/notes/types";
import { useNotes } from "../../../features/notes/useNotes";
import { findAirport, type Airport } from "../../../features/place/airports";
import { placeLink } from "../../../features/place/google-maps";
import { lngLat, needsPin, pinnedOf, type Pinned } from "../../../features/place/pin";
import { boundsOf, dayStops, routeLine } from "../../../features/place/route";
import { guardMissingProperties } from "../../../features/place/style";
import type { LatLng } from "../../../features/place/types";
import { useAirports } from "../../../features/place/useAirports";
import { useTags } from "../../../features/tags/useTags";
import { hhmm, shortDate } from "../../../features/trip/format";
import { flightDays, stayOn, wakeAt } from "../../../features/trip/itinerary";
import type { Leg } from "../../../features/trip/types";
import { useTrip } from "../../../features/trip/useTrip";
import { useWorker } from "../../../features/worker/useWorker";
import closeIcon from "../../../icons/close.svg";
import Icon from "../../../icons/Icon.vue";
import plusIcon from "../../../icons/plus.svg";
import { queryOf } from "../url";

/** A sheet over the map: a memo written at a place (or, from the stamp, at none yet), or one to edit */
const route = useRoute("/rooms/[roomId=roomId]/map");
const router = useRouter();
const openSheet = (form: FormTarget) =>
  router.push({
    name: "/rooms/[roomId=roomId]/map",
    params: { roomId: route.params.roomId, ...queryOf(form) },
  });
const write = (pin: LatLng | null) => void openSheet({ kind: "new", pin });
const { notes } = useNotes();
const { members } = useMembers();
/** A note's paper: whoever wrote it */
const paperFor = (n: Note) => paperOf(members.value?.find((m) => m.id === n.by)?.color);
const tags = useTags();
const { trip, forDay } = useTrip();
const i18n = useI18n();
/** Whether a memo's place can be found from its words (the form's "Find the place") */
const worker = useWorker();
const price = (amount: number) =>
  trip.value === undefined ? "" : formatMoney(amount, trip.value.currency, i18n.locale);
const short = (date: Temporal.PlainDate) => shortDate(date, i18n.locale);
const el = useTemplateRef<HTMLElement>("el");
/** How long a press is held to write a memo there; where it is held, while it is */
const HOLD_MS = 500;
const holding = ref<Pt | null>(null);
/** The pin whose card is open, by id: the note object is replaced whenever it changes */
const selectedId = ref<NoteId | null>(null);
const selected = computed(
  (): Pinned | null => pinnedOf(notes.value ?? []).find((n) => n.id === selectedId.value) ?? null,
);
const day = ref<Temporal.PlainDate | null>(null); // show a day's route
const isDay = (date: Temporal.PlainDate) => day.value?.equals(date) ?? false;
const toggleDay = (date: Temporal.PlainDate) => (day.value = isDay(date) ? null : date);
const noPin = computed(() => (notes.value ?? []).filter(needsPin).length);
const showAllDays = () => (day.value = null);
const closeCard = () => (selectedId.value = null);
const editSelected = () => {
  if (selected.value !== null) void openSheet({ kind: "edit", id: selected.value.id });
};
const selectedLink = computed(() => (selected.value === null ? null : placeLink(selected.value)));

// free vector tiles, no key. Swap the style URL for your own if you self-host.
const STYLE = "https://tiles.openfreemap.org/styles/liberty";

let map: MLMap | null = null;
const markers = new Map<NoteId, Marker>();

onMounted(() => {
  if (el.value === null) return;
  map = new MLMap({
    container: el.value,
    // the trip's area; the whole world until the room says where we are going
    center: trip.value === undefined ? [0, 0] : [trip.value.center.lng, trip.value.center.lat],
    zoom: trip.value === undefined ? 1 : 11.5,
    attributionControl: { compact: true },
  });
  // A wheel or a trackpad zooms about twice as fast as MapLibre's default (1/450 a notch's
  // delta, 1/100 a trackpad's), which took many turns to get from the city to a street. A pinch
  // is left as it is: the map follows the fingers, and a faster one would slip away from them.
  map.scrollZoom.setWheelZoomRate(1 / 220);
  map.scrollZoom.setZoomRate(1 / 50);
  // the style as fetched, with its filters guarded against tiles that lack what they compare
  map.setStyle(STYLE, { transformStyle: (_, next) => guardMissingProperties(next) });
  map.addControl(
    new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: false,
    }),
    "bottom-right",
  );
  map.on("load", () => {
    map?.addSource("route", { type: "geojson", data: routeLine([]) });
    map?.addLayer({
      id: "route",
      type: "line",
      source: "route",
      layout: { "line-join": "round", "line-cap": "round" },
      // the paper's ink (MapLibre paints with a literal color, not a CSS variable); the tiles are light in both themes
      paint: { "line-color": "#24272e", "line-width": 3, "line-dasharray": [1.5, 1.5] },
    });
    syncMarkers();
    syncStays();
    syncAirports();
    syncRoute();
  });
  map.on("click", () => {
    // the click that ends a long press is not also a click on the map (closing the open card)
    if (held) held = false;
    else selectedId.value = null;
  });

  // a long press of a finger writes a new memo pinned where it was held, and a ring fills at the
  // point while it is held, so holding visibly does something; with a mouse it is a right click
  let t: number | undefined;
  let start: Pt | null = null;
  let held = false;
  function hold(point: Pt, at: LatLng) {
    cancelHold();
    start = point;
    holding.value = point;
    // one hold at a time: a new one (or a move, a lift) cancels the one before
    t = window.setTimeout(heldLong, HOLD_MS, at);
  }
  /** Held long enough at `at`: a memo is written there */
  function heldLong(at: LatLng) {
    held = true;
    holding.value = null;
    navigator.vibrate?.(10);
    write(at);
  }
  function moved(point: Pt) {
    if (start !== null && Math.hypot(point.x - start.x, point.y - start.y) > 8) cancelHold();
  }
  function cancelHold() {
    clearTimeout(t);
    start = null;
    holding.value = null;
  }
  map.on("touchstart", (e) => {
    // a new touch: a long press before it that brought no click has nothing left to swallow
    held = false;
    if (e.originalEvent.touches.length !== 1) return cancelHold();
    hold(e.point, { lat: e.lngLat.lat, lng: e.lngLat.lng });
  });
  map.on("touchmove", (e) => moved(e.point));
  map.on("touchend", cancelHold);
  map.on("touchcancel", cancelHold);
  map.on("dragstart", cancelHold);
  map.on("contextmenu", (e) => write({ lat: e.lngLat.lat, lng: e.lngLat.lng }));
});
// Kept while another tab is up, out of the page: back in it, the map measures its box again
onActivated(() => map?.resize());
onBeforeUnmount(() => {
  markers.forEach((m) => m.remove());
  stayMarkers.forEach((m) => m.remove());
  airportMarkers.forEach((m) => m.remove());
  map?.remove();
  map = null;
});

/** A memo's marker, an element on the page: only ever made for the map, which is a browser's */
function pinEl(n: Pinned) {
  if (import.meta.env.SSR) throw new Error("a map marker is made in a browser only");
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

// The markers are elements on the page, made in a browser only (the map is made on mount)
function syncMarkers() {
  if (import.meta.env.SSR) return;
  if (map === null) return;
  const seen = new Set<NoteId>();
  for (const n of pinnedOf(notes.value ?? [])) {
    seen.add(n.id);
    let m = markers.get(n.id);
    if (m === undefined) {
      m = new Marker({ element: pinEl(n), anchor: "bottom" }).setLngLat(lngLat(n.pin)).addTo(map);
      markers.set(n.id, m);
    } else m.setLngLat(lngLat(n.pin));
    const e = m.getElement();
    const visibility = tags.visibility(n);
    e.classList.toggle("dim", visibility === "dimmed");
    e.style.display = visibility === "hidden" ? "none" : "";
    e.classList.toggle("on", selected.value?.id === n.id);
    // the pin is the note's own paper (whoever wrote it), as its card on the desk is
    e.style.setProperty("--pin", paperFor(n));
    const label = e.querySelector(".lbl");
    if (label !== null) label.textContent = n.title;
  }
  for (const [id, m] of markers)
    if (!seen.has(id)) {
      m.remove();
      markers.delete(id);
    }
}
function syncRoute() {
  if (map === null) return;
  const src = map.getSource("route");
  if (!(src instanceof maplibregl.GeoJSONSource)) return;
  const d = day.value;
  const stays = trip.value?.stays ?? [];
  // a day leaves from the night before's stay, or the airport it lands at on the way there; and
  // ends at its night's stay, or the airport it leaves from on the way home
  const stops =
    d === null
      ? []
      : dayStops(
          forDay(d),
          wakeAt(stays, d)?.pin ?? airportOn(d, "out")?.at ?? null,
          stayOn(stays, d)?.pin ?? airportOn(d, "back")?.at ?? null,
        );
  src.setData(routeLine(stops));
  const b = boundsOf(stops);
  if (b !== null) {
    map.fitBounds(b, {
      padding: { top: 60, bottom: 240, left: 40, right: 40 },
      duration: 500,
      maxZoom: 14,
    });
  }
}
// re-sync whenever notes, filter or selection change (cheap: a dozen DOM toggles), once there
// is a page to put pins on
onMounted(() => {
  watchEffect(() => {
    void pinnedOf(notes.value ?? []).map((n) => [
      n.pin.lat,
      n.pin.lng,
      n.title,
      n.by,
      n.tags.length,
    ]);
    void members.value;
    void tags.mode;
    void [...tags.selected];
    void selected.value;
    syncMarkers();
  });
});
const scheduleKey = (n: Note) =>
  n.kind === "memo" && n.schedule !== null
    ? `${n.schedule.date} ${n.schedule.time} ${n.schedule.status}`
    : "";
watch([day, () => (notes.value ?? []).map(scheduleKey), () => trip.value?.stays], syncRoute);

/** Where the nights are spent, a square of ink each, under the notes' pins */
const stayMarkers: Marker[] = [];
function syncStays() {
  if (import.meta.env.SSR) return;
  if (map === null) return;
  for (const m of stayMarkers.splice(0)) m.remove();
  for (const s of trip.value?.stays ?? []) {
    if (s.pin === null) continue;
    const d = document.createElement("div");
    d.className = "pin stay";
    const dot = document.createElement("span"),
      lbl = document.createElement("span");
    dot.className = "dot";
    lbl.className = "lbl";
    lbl.textContent = s.name;
    d.append(dot, lbl);
    stayMarkers.push(
      new Marker({ element: d, anchor: "bottom" }).setLngLat(lngLat(s.pin)).addTo(map),
    );
  }
}
watch(() => trip.value?.stays, syncStays);

// ---- the airports the flights name, found among the airports (airports.ts) ----
const airports = useAirports();
/**
 * The airport a day touches on a flight: on the way there the one it lands at, on the way home
 * the one it leaves from, when the flight is on that day
 */
function airportOn(d: Temporal.PlainDate, leg: Leg) {
  const f = trip.value?.flights[leg] ?? null;
  if (f === null) return undefined;
  const days = flightDays(f, leg, trip.value?.days ?? []);
  const on = leg === "out" ? days.at(-1) : days[0];
  if (on === undefined || !on.equals(d)) return undefined;
  return findAirport(airports.value, leg === "out" ? f.to : f.from);
}
/** Each airport a flight names, once, a plane-shaped badge of ink */
const airportMarkers: Marker[] = [];
function syncAirports() {
  if (import.meta.env.SSR) return;
  if (map === null) return;
  for (const m of airportMarkers.splice(0)) m.remove();
  const named = new Map<string, Airport>();
  for (const f of [trip.value?.flights.out, trip.value?.flights.back])
    for (const text of f == null ? [] : [f.from, f.to]) {
      const a = findAirport(airports.value, text);
      if (a !== undefined) named.set(a.code, a);
    }
  for (const a of named.values()) {
    const d = document.createElement("div");
    d.className = "pin airport";
    const dot = document.createElement("span"),
      lbl = document.createElement("span");
    dot.className = "dot";
    dot.textContent = "✈";
    lbl.className = "lbl";
    lbl.textContent = `${a.code} ${a.name}`;
    d.append(dot, lbl);
    airportMarkers.push(
      new Marker({ element: d, anchor: "bottom" }).setLngLat(lngLat(a.at)).addTo(map),
    );
  }
}
watch([() => trip.value?.flights, airports], () => {
  syncAirports();
  syncRoute();
});

function fitAll() {
  const b = boundsOf(pinnedOf(notes.value ?? []).map((n) => lngLat(n.pin)));
  if (b !== null) map?.fitBounds(b, { padding: 80, duration: 500 });
}
</script>

<template>
  <section>
    <div>
      <div ref="el"></div>

      <!-- no bar: the days float along the top of the map, over it -->
      <div class="top">
        <div class="days">
          <CtScrollRow inset>
            <CtChip float :selected="day === null" @click="showAllDays">{{
              i18n.t("map.all")
            }}</CtChip>
            <CtChip
              v-for="d in trip?.days"
              :key="d.date.toString()"
              float
              :selected="isDay(d.date)"
              @click="() => toggleDay(d.date)"
            >{{ i18n.t("map.route", { date: short(d.date) }) }}</CtChip>
          </CtScrollRow>
        </div>
        <!-- the desk's filter follows the pins here, and can be cleared here -->
        <div v-if="tags.selected.size > 0" class="filter">
          <CtScrollRow inset>
            <CtChip dashed float @click="() => tags.selected.clear()">{{
              i18n.t("filter.clear")
            }}</CtChip>
            <CtChip
              v-for="t in tags.tagList.filter((x) => tags.selected.has(x.name))"
              :key="t.name"
              float
              selected
              toggle
              @click="() => tags.toggleTag(t.name)"
            >#{{ t.name }}</CtChip>
          </CtScrollRow>
        </div>
        <CtBadge v-if="noPin > 0" as="p" class="unplaced" float>{{
          i18n.t(worker.api ? "map.noPinFind" : "map.noPin", { count: noPin })
        }}</CtBadge>
      </div>

      <!-- the press being held: a ring that fills, and the memo is written when it closes -->
      <span
        v-if="holding !== null"
        aria-hidden="true"
        class="hold"
        :style="`--x: ${holding.x}px; --y: ${holding.y}px; --hold: ${HOLD_MS}ms`"
      ></span>

      <div class="jump"><CtChip float @click="fitAll">{{ i18n.t("common.fitAll") }}</CtChip></div>

      <!-- the same write button as the canvas: writing is never more than a tap away -->
      <CtFab :label="i18n.t('canvas.write')" @click="() => write(null)"><Icon
          :size="24"
          :src="plusIcon"
        /></CtFab>

      <CtPanel v-if="selected !== null" as="article" float :style="`--card:${paperFor(selected)}`">
        <CtHeading level="card">{{ selected.title }}</CtHeading>
        <CtHint v-if="selected.body !== ''" size="sm">{{ selected.body }}</CtHint>
        <CtHint class="facts" strong>
          <span v-for="t in selected.tags" :key="t">#{{ t }} </span>
          <span v-if="selected.budget !== null && selected.budget > 0">{{ price(selected.budget) }} </span>
          <span v-if="selected.schedule !== null">{{ short(selected.schedule.date) }} {{ selected.schedule.time ? hhmm(selected.schedule.time) : "" }}</span>
        </CtHint>
        <div>
          <CtLink :href="selectedLink">{{ i18n.t("map.openInGoogleMaps") }}</CtLink>
          <CtButton @click="editSelected">{{ i18n.t("common.edit") }}</CtButton>
          <CtButton class="close" :label="i18n.t('common.close')" @click="closeCard"><Icon
              :size="18"
              :src="closeIcon"
            /></CtButton>
        </div>
      </CtPanel>
    </div>
  </section>
</template>

<style scoped>
@import "../../../../ui/styles/media.css";

section {
  position: absolute;
  inset: 0;
  isolation: isolate;
  display: flex;
  flex-direction: column;
  background: var(--bg);

  /* marker elements are built with innerHTML inside the map container */
  :deep(.pin) {
    /* the white under a pin's name, and round and on an ink badge, over the map in either theme */
    --halo: rgb(255 255 255 / 0.92);
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
      background: var(--halo);
      padding: 1px 6px;
      border-radius: 999px;
      box-shadow: 0 1px 2px rgb(17 19 24 / 0.12);
    }

    &.on > .dot {
      transform: rotate(-45deg) scale(1.3);
    }

    /* an airport: a round badge of ink with a plane in it, and nothing to tap */
    &.airport {
      cursor: default;
      pointer-events: none;

      > .dot {
        display: grid;
        place-items: center;
        width: 22px;
        height: 22px;
        border-radius: 50%;
        transform: none;
        background: var(--paper-ink);
        border-color: var(--halo);
        color: var(--halo);
        font-size: var(--font-2xs);
        line-height: 1;
      }
    }

    /* a stay: a square of ink, not a note's paper, and nothing to tap */
    &.stay {
      cursor: default;
      pointer-events: none;

      > .dot {
        border-radius: 4px;
        transform: none;
        background: var(--paper-ink);
        border-color: var(--halo);
      }
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
    inset-block-end: calc(var(--dock-clear) + 72px);
  }

  /* MapLibre's own buttons (geolocate, the compact attribution) at the same 36px as every other tool */
  :deep(.maplibregl-ctrl-group button),
  :deep(.maplibregl-ctrl-attrib-button) {
    width: var(--tap);
    height: var(--tap);
  }

  /*
   * MapLibre draws the attribution for a 24px button: its "i" is a background that repeats
   * at any larger size, in a pill 24px tall. One centered "i", in a pill as tall as the button.
   */
  :deep(.maplibregl-ctrl-attrib-button) {
    background-repeat: no-repeat;
    background-position: center;
    border-radius: calc(var(--tap) / 2);
  }

  :deep(.maplibregl-ctrl-attrib.maplibregl-compact) {
    min-height: calc(var(--tap) - 4px);
    padding-inline-end: var(--tap);
    border-radius: calc(var(--tap) / 2);
  }

  /* open, the credit line sits in the middle of the pill, beside the button */
  :deep(.maplibregl-ctrl-attrib.maplibregl-compact-show) {
    min-height: 20px;
    padding: 8px calc(var(--tap) + 4px) 8px 12px;
  }

  /* the attribution would sit under the fit button otherwise */
  :deep(.maplibregl-ctrl-bottom-left) {
    inset-block-end: calc(var(--dock-clear) + 76px);
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
      padding: var(--top-inset) 0 0;
      pointer-events: none;
      display: flex;
      flex-direction: column;
      gap: 6px;

      > * {
        pointer-events: auto;
      }

      /* the days, in the row where a bar would be */
      > .days {
        display: flex;
        min-height: var(--top-row);
      }

      /* the filter, a row of its own under the days */
      > .filter {
        display: flex;
      }

      /* the notes with no place yet, under the rows, at the view's edge margin */
      > .unplaced {
        margin: 0 16px;
        align-self: flex-start;
      }
    }

    /* a ring that closes as the press is held, at the point held */
    > .hold {
      position: absolute;
      inset-inline-start: 0;
      inset-block-start: 0;
      z-index: var(--z-float-top);
      width: 56px;
      height: 56px;
      margin: -28px 0 0 -28px;
      translate: var(--x) var(--y);
      border-radius: 50%;
      pointer-events: none;
      /* the tiles are light in both themes, so the paper's ink, which is always dark */
      background: conic-gradient(var(--paper-ink) calc(var(--fill) * 1turn), transparent 0);
      mask: radial-gradient(circle, transparent 22px, #000 23px);
      animation: hold var(--hold) linear both;

      @media (--reduced-motion) {
        animation: none;
        --fill: 1;
        opacity: 0.6;
      }
    }

    /* level with the write button's middle, as on the desk: a chip floating over the map */
    > .jump {
      position: absolute;
      inset-inline-start: 16px;
      inset-block-end: calc(var(--dock-clear) + 16px + (56px - var(--tap)) / 2);
      z-index: var(--z-float);
    }

    /* the open pin's card */
    > article {
      position: absolute;
      inset-inline: 12px;
      inset-block-end: calc(var(--dock-clear) + 88px);
      z-index: var(--z-float-top);

      > h2 {
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
      }

      /* tags, budget, when */
      > .facts {
        margin: 4px 0 0;
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

        /* close, at the end */
        > .close {
          margin-inline-start: auto;
        }
      }
    }
  }
}

@property --fill {
  syntax: "<number>";
  inherits: false;
  initial-value: 0;
}
@keyframes hold {
  from {
    --fill: 0;
  }
  to {
    --fill: 1;
  }
}
</style>
