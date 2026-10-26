import * as v from "valibot";

import type { MemberId } from "../../contract/member";
import { NoteIdSchema, type NoteId } from "../../contract/note";
import {
  COORD,
  type IsoDate,
  type IsoInstant,
  type WireNote,
  type WireTrip,
} from "../../contract/wire";
import type { DraftContext, PlaceContext, SuggestContext, TagContext } from "../claude";

/** What the agent needs to draft `date` of `trip`; null when the trip has no such day */
export const draftContext = (
  trip: WireTrip,
  notes: WireNote[],
  date: IsoDate,
): DraftContext | null => {
  if (!trip.days.some((d) => d.date === date)) return null;
  const planned = notes.filter((n) => n.kind === "memo").filter((n) => n.schedule?.date === date);
  return { trip: trip.name, currency: trip.currency, date, notes: planned };
};

/** What naming a memo's place needs: which trip, and when */
export const placeContext = (trip: WireTrip): PlaceContext => ({
  trip: trip.name,
  days: trip.days.map((d) => d.date),
});

/** What tagging a memo needs: the trip, the tags in use, the candidates */
export const tagContext = (
  trip: WireTrip,
  notes: WireNote[],
  candidates: string[],
): TagContext & { candidates: string[] } => ({
  trip: trip.name,
  days: trip.days.map((d) => d.date),
  tags: [...new Set(notes.flatMap((n) => (n.kind === "memo" ? n.tags : [])))],
  // what is written on paper: a text box's words are a label on the desk, not a plan
  titles: notes.flatMap((n) => (n.kind === "memo" || n.kind === "suggestion" ? n.title : [])),
  candidates,
});

/**
 * What the agent reads to suggest ideas from the note `about` (or from none); null when that
 * note is not on the desk, or has no words to start from
 */
export const suggestContext = (
  trip: WireTrip,
  desk: WireNote[],
  about: NoteId | null,
): SuggestContext | null => {
  // a sticker has no words to read
  const notes = desk.filter((n) => n.kind !== "sticker");
  const from = about === null ? null : notes.find((n) => n.id === about);
  if (from === undefined) return null;
  return {
    trip: trip.name,
    days: trip.days.map((d) => d.date),
    notes: notes.map((n) => ({
      title: n.kind === "text" ? n.text : n.title,
      tags: n.kind === "memo" ? n.tags : [],
      date: n.kind === "memo" ? (n.schedule?.date ?? null) : null,
    })),
    about:
      from === null
        ? null
        : {
            title: from.kind === "text" ? from.text : from.title,
            body: from.kind === "memo" ? from.body : "",
            tags: from.kind === "memo" ? from.tags : [],
            pin: from.kind === "memo" ? from.pin : null,
          },
  };
};

/**
 * The agent `by`'s idea `title` as a suggestion card, the `i`th of a short column under `at`
 * where the asker was looking, slightly askew like any card, and on the desk however near its
 * edge they looked
 */
export const suggestionNote = (
  title: string,
  i: number,
  at: { x: number; y: number },
  by: MemberId,
  now: IsoInstant,
): WireNote => ({
  id: v.parse(NoteIdSchema, crypto.randomUUID()),
  kind: "suggestion",
  title,
  color: "#ffffff",
  x: Math.min(Math.max(at.x - 82 + (i % 2 === 0 ? -12 : 12), -COORD), COORD),
  y: Math.min(Math.max(at.y - 40 + i * 120, -COORD), COORD),
  rot: Math.random() * 4 - 2,
  scale: 1,
  by,
  updatedAt: now,
});

/** The agent's candidate tags for the trip, in the order they were proposed */
export const candidates = (sql: SqlStorage): string[] => {
  candidateTable(sql);
  return sql
    .exec<{ tag: string }>("SELECT tag FROM tag_candidates ORDER BY rowid")
    .toArray()
    .map((r) => r.tag);
};

/**
 * Whether the asker is the one to have the agent propose the trip's candidate tags: yes once a
 * trip, to the first who asks, and to nobody else while that proposal is on its way, unless it
 * was claimed `waitFor` or longer ago
 */
export const claimProposal = (sql: SqlStorage, waitFor: number): boolean => {
  candidateTable(sql);
  const now = Date.now();
  const claim = sql
    .exec<{ at: number; done: number }>("SELECT at, done FROM tag_proposal")
    .toArray()[0];
  if (candidates(sql).length > 0 || claim?.done === 1) return false;
  if (claim !== undefined && now - claim.at < waitFor) return false;
  sql.exec(
    `INSERT INTO tag_proposal (id, at, done) VALUES (1, ?, 0)
     ON CONFLICT (id) DO UPDATE SET at = excluded.at`,
    now,
  );
  return true;
};

/** The proposal claimed is not made: the next ask may claim it */
export const releaseProposal = (sql: SqlStorage): void => {
  candidateTable(sql);
  sql.exec("DELETE FROM tag_proposal WHERE done = 0");
};

/** Keeps the agent's candidate tags, and that the trip's proposal is made */
export const saveCandidates = (sql: SqlStorage, tags: string[]): void => {
  candidateTable(sql);
  for (const tag of tags) sql.exec("INSERT OR IGNORE INTO tag_candidates (tag) VALUES (?)", tag);
  sql.exec(
    `INSERT INTO tag_proposal (id, at, done) VALUES (1, ?, 1)
     ON CONFLICT (id) DO UPDATE SET done = 1`,
    Date.now(),
  );
};

const candidateTable = (sql: SqlStorage): void => {
  sql.exec(`
    CREATE TABLE IF NOT EXISTS tag_candidates (tag TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS tag_proposal (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      at INTEGER NOT NULL,
      done INTEGER NOT NULL
    );
  `);
};

/** Writes one of the agent's paid calls into its ledger: who asked, when, for what, how many tokens */
export const recordAgentCall = (
  sql: SqlStorage,
  by: MemberId,
  what: string,
  tokens: { input: number; output: number },
): void => {
  sql.exec(`
    CREATE TABLE IF NOT EXISTS agent_calls (
      at TEXT NOT NULL,
      by TEXT NOT NULL,
      what TEXT NOT NULL,
      input_tokens INTEGER NOT NULL,
      output_tokens INTEGER NOT NULL
    )
  `);
  sql.exec(
    "INSERT INTO agent_calls (at, by, what, input_tokens, output_tokens) VALUES (?, ?, ?, ?, ?)",
    new Date().toISOString(),
    by,
    what,
    tokens.input,
    tokens.output,
  );
};
