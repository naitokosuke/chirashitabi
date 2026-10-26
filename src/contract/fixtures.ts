import * as v from "valibot";

import { WireMemoSchema, type WireMemo } from "./wire";

/** What a memo is made of on the wire before the contract reads it: plain strings for its brands */
type WireMemoInput = v.InferInput<typeof WireMemoSchema>;

/**
 * A memo as the room sends it, for the tests: blank but for its id (its title too), and
 * whatever `extra` says. Read through the contract's own schema, so a fixture the room would
 * refuse fails where it is made, not in the test that uses it.
 */
export function makeWireMemo(id: string, extra: Partial<WireMemoInput> = {}): WireMemo {
  return v.parse(WireMemoSchema, {
    id,
    kind: "memo",
    title: id,
    color: "#fff1b8",
    x: 0,
    y: 0,
    rot: 0,
    scale: 1,
    by: "agent:claude",
    updatedAt: "2026-10-01T00:00:00Z",
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
  } satisfies WireMemoInput);
}
