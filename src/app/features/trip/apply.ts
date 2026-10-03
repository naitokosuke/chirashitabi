import type { Mutation } from "../sync/types";

import type { Day } from "./types";

/** The trip's days after a mutation; a changed day is a new object, nothing changes in place */
export function applyToDays(days: Day[], m: Mutation): Day[] {
  if (m.type !== "day:intro") return days;
  const i = days.findIndex((d) => d.date.equals(m.date));
  const old = days[i];
  if (old === undefined || old.intro === m.intro) return days;
  const next = { ...old, intro: m.intro };
  return days.map((d, j) => (j === i ? next : d));
}
