import { Temporal } from "temporal-polyfill-lite";

import type { RoomSummary } from "./types";

/**
 * Where a trip stands on `today`: days to go, which day of it today is, or over. A trip
 * starting today is on its first day, not zero days away.
 */
export type When =
  | { kind: "ahead"; in: number }
  | { kind: "during"; day: number }
  | { kind: "past" };

export function whenOf(trip: Pick<RoomSummary, "first" | "days">, today: Temporal.PlainDate): When {
  const since = trip.first.until(today, { largestUnit: "days" }).days;
  if (since < 0) return { kind: "ahead", in: -since };
  if (since < trip.days) return { kind: "during", day: since + 1 };
  return { kind: "past" };
}

/** The last day of a trip */
export const lastDay = (trip: Pick<RoomSummary, "first" | "days">) =>
  trip.first.add({ days: trip.days - 1 });

/**
 * The trips in two piles. Coming up: the one under way first, then by how soon it starts.
 * Been: the most recent first.
 */
export function shelve(
  rooms: readonly RoomSummary[],
  today: Temporal.PlainDate,
): { coming: RoomSummary[]; been: RoomSummary[] } {
  // only those not over are ranked: under way, or days ahead
  const rank = (w: When) => (w.kind === "ahead" ? w.in : -1);
  const placed = rooms.map((room) => ({ room, when: whenOf(room, today) }));
  const coming = placed
    .filter((p) => p.when.kind !== "past")
    .sort((a, b) => rank(a.when) - rank(b.when))
    .map((p) => p.room);
  const been = placed
    .filter((p) => p.when.kind === "past")
    .map((p) => p.room)
    .sort((a, b) => Temporal.PlainDate.compare(lastDay(b), lastDay(a)));
  return { coming, been };
}
