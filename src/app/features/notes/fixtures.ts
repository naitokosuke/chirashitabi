import { Temporal } from "temporal-polyfill-lite";

import * as v from "valibot";

import { MemberIdSchema } from "../members/types";

import { NoteIdSchema } from "./id";
import type { Memo } from "./types";

/**
 * A memo as the app holds it, for the tests and the mock room: blank but for its id (its title
 * too), and whatever `extra` says. Its id is read through the contract's schema, so one the
 * room would refuse fails where it is made.
 */
export function makeMemo(id: string, extra: Partial<Memo> = {}): Memo {
  return {
    id: v.parse(NoteIdSchema, id),
    kind: "memo",
    title: id,
    color: "#fff1b8",
    x: 0,
    y: 0,
    rot: 0,
    scale: 1,
    by: v.parse(MemberIdSchema, "agent:claude"),
    updatedAt: Temporal.Instant.from("2026-10-01T00:00:00Z"),
    body: "",
    tags: [],
    mapsUrl: null,
    pin: null,
    schedule: null,
    budget: null,
    checked: false,
    image: null,
    minutes: null,
    hours: null,
    link: null,
    booking: null,
    due: null,
    assignee: null,
    ...extra,
  } satisfies Memo;
}
