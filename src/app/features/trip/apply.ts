import type { Temporal } from "temporal-polyfill-lite";

import type { Note } from "../notes/types";
import type { Mutation } from "../sync/types";

import type { Day, TripSnapshot } from "./types";

/** The trip's days after a mutation; a changed day is a new object, nothing changes in place */
export function applyToDays(days: Day[], m: Mutation): Day[] {
  if (m.type === "trip:dates") return datesOf(days, m.first, m.days);
  if (m.type !== "day:intro") return days;
  const i = days.findIndex((d) => d.date.equals(m.date));
  const old = days[i];
  if (old === undefined || old.intro === m.intro) return days;
  const next = { ...old, intro: m.intro };
  return days.map((d, j) => (j === i ? next : d));
}

/**
 * `count` days from `first`, each keeping the intro of the day at its place in the trip before
 * (day 2's is still day 2's), as the room does (worker/room.ts)
 */
function datesOf(days: Day[], first: Temporal.PlainDate, count: number): Day[] {
  const same = days.length === count && days[0] !== undefined && days[0].date.equals(first);
  if (same) return days;
  return Array.from({ length: count }, (_, i) => ({
    date: first.add({ days: i }),
    intro: days[i]?.intro ?? "",
  }));
}

/** The trip after a mutation: its name, its days, a flight or its stays; unchanged, it is the same object */
export function applyToTrip(trip: TripSnapshot, m: Mutation): TripSnapshot {
  if (m.type === "trip:rename") return trip.name === m.name ? trip : { ...trip, name: m.name };
  if (m.type === "trip:flight") return { ...trip, flights: { ...trip.flights, [m.leg]: m.flight } };
  if (m.type === "trip:stays") return { ...trip, stays: m.stays };
  const days = applyToDays(trip.days, m);
  return days === trip.days ? trip : { ...trip, days };
}

/**
 * The notes after the trip moved from starting on `was` to the new run of days: each planned
 * note moves by as many days as the first day did, and one that lands outside the trip loses
 * its day (back to the tray), as the room does. `at` stamps the ones that changed.
 */
export function moveSchedules(
  notes: Note[],
  was: Temporal.PlainDate | undefined,
  m: Extract<Mutation, { type: "trip:dates" }>,
  at: Temporal.Instant,
): Note[] {
  const shift = was === undefined ? 0 : was.until(m.first, { largestUnit: "days" }).days;
  const last = m.first.add({ days: m.days - 1 });
  let changed = false;
  const next = notes.map((n) => {
    if (n.kind !== "memo" || n.schedule === null) return n;
    const date = n.schedule.date.add({ days: shift });
    const inside = date.since(m.first).days >= 0 && last.since(date).days >= 0;
    if (inside && shift === 0) return n;
    changed = true;
    return {
      ...n,
      schedule: inside ? { ...n.schedule, date } : null,
      updatedAt: at,
    };
  });
  return changed ? next : notes;
}
