import type { Mutation } from "../sync/types";

import type { Day, TripSnapshot } from "./types";

/** The trip's days after a mutation; a changed day is a new object, nothing changes in place */
export function applyToDays(days: Day[], m: Mutation): Day[] {
  if (m.type !== "day:intro") return days;
  const i = days.findIndex((d) => d.date.equals(m.date));
  const old = days[i];
  if (old === undefined || old.intro === m.intro) return days;
  const next = { ...old, intro: m.intro };
  return days.map((d, j) => (j === i ? next : d));
}

/** The trip after a mutation: its name, or one of its days; unchanged, it is the same object */
export function applyToTrip(trip: TripSnapshot, m: Mutation): TripSnapshot {
  if (m.type === "trip:rename") return trip.name === m.name ? trip : { ...trip, name: m.name };
  const days = applyToDays(trip.days, m);
  return days === trip.days ? trip : { ...trip, days };
}
