import { Temporal } from "temporal-polyfill-lite";

import type { RoomSummary } from "./types";

/**
 * Where a trip stands on `today`: days to go, which day of it today is, over, or not dated.
 * A trip starting today is on its first day, not zero days away.
 */
export type When =
  | { kind: "ahead"; in: number }
  | { kind: "during"; day: number }
  | { kind: "past" }
  | { kind: "undated" };

export function whenOf(trip: Pick<RoomSummary, "first" | "days">, today: Temporal.PlainDate): When {
  if (trip.first === null || trip.days === 0) return { kind: "undated" };
  const since = trip.first.until(today, { largestUnit: "days" }).days;
  if (since < 0) return { kind: "ahead", in: -since };
  if (since < trip.days) return { kind: "during", day: since + 1 };
  return { kind: "past" };
}

/** The last day of a trip, or null while it has none */
export const lastDay = (trip: Pick<RoomSummary, "first" | "days">) =>
  trip.first === null || trip.days === 0 ? null : trip.first.add({ days: trip.days - 1 });

/**
 * The trips in two piles. Coming up: the one under way first, then by how soon it starts, the
 * undated ones last. Been: the most recent first.
 */
export function shelve(
  rooms: readonly RoomSummary[],
  today: Temporal.PlainDate,
): { coming: RoomSummary[]; been: RoomSummary[] } {
  const rank = (w: When) =>
    w.kind === "during" ? -1 : w.kind === "ahead" ? w.in : Number.POSITIVE_INFINITY;
  const placed = rooms.map((room) => ({ room, when: whenOf(room, today) }));
  const coming = placed
    .filter((p) => p.when.kind !== "past")
    // two undated trips are both infinitely far: neither goes first
    .sort((a, b) => (rank(a.when) === rank(b.when) ? 0 : rank(a.when) - rank(b.when)))
    .map((p) => p.room);
  const been = placed
    .filter((p) => p.when.kind === "past")
    .map((p) => p.room)
    // ISO dates sort as strings
    .sort((a, b) => String(lastDay(b)).localeCompare(String(lastDay(a))));
  return { coming, been };
}
