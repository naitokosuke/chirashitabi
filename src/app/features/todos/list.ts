import { Temporal } from "temporal-polyfill-lite";

import { TODO_TAG, type Memo, type Note } from "../notes/types";

/**
 * What there is to do before the trip: a to-do (a memo tagged To do, ticked off when done), or a
 * plan still to book (done once it is booked), each by its day when it has one
 */
export type Todo =
  | { kind: "task"; memo: Memo; due: Temporal.PlainDate | null; done: boolean }
  | { kind: "booking"; memo: Memo; due: Temporal.PlainDate | null; done: false };

const isMemo = (n: Note) => n.kind === "memo";

/** Open before done, then the soonest day first and those with none after, then as written */
function byDue(a: Todo, b: Todo) {
  if (a.done !== b.done) return Number(a.done) - Number(b.done);
  if (a.due === null || b.due === null) return Number(a.due === null) - Number(b.due === null);
  return Temporal.PlainDate.compare(a.due, b.due);
}

/** Every to-do and every plan still to book, in the order to do them */
export function todosOf(notes: Note[]): Todo[] {
  const memos = notes.filter(isMemo);
  const tasks = memos
    .filter((n) => n.tags.includes(TODO_TAG))
    .map((memo): Todo => ({ kind: "task", memo, due: memo.due, done: memo.checked }));
  const bookings = memos.flatMap((memo): Todo[] =>
    memo.booking?.state === "needed"
      ? [{ kind: "booking", memo, due: memo.booking.by, done: false }]
      : [],
  );
  return [...tasks, ...bookings].sort(byDue);
}

/** Still open and its day has passed */
export const isLate = (t: Todo, today: Temporal.PlainDate) =>
  !t.done && t.due !== null && Temporal.PlainDate.compare(t.due, today) < 0;
