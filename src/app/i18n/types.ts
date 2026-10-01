import type { en } from "./messages/en";

/** "shiori.dayHeading", … — the ids of the source messages */
export type MessageId = keyof typeof en;

/** One locale's messages: an MF2 source for every id */
export type Messages = Record<MessageId, string>;

/** Values for the `$`-variables of a message */
export type MessageParams = Record<string, unknown>;

/**
 * A message cut at its markup, for rendering: plain text, or the text inside
 * `{#name}…{/name}` (empty for a standalone `{#name /}`).
 * `at` is the formatted part it starts at, so it stays put while only the values change.
 */
export type Segment =
  | { kind: "text"; at: number; text: string }
  | { kind: "markup"; at: number; name: string; text: string };
