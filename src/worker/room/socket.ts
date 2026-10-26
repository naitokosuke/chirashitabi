import type { MemberId } from "../../contract/member";
import { RATE } from "../../contract/room";
import type { Cid, IsoInstant, ServerMessage, WireNote } from "../../contract/wire";

/** A message to a member's socket, as it goes; the type checks it against what the app reads */
export const encode = (message: ServerMessage): string =>
  JSON.stringify(withPreviousBuildFields(message));

/**
 * A message as a tab still on the previous build reads it too: that build reads a `title` and a
 * `color` on every note, so a text box goes with its words as its `title` and a sticker with a
 * blank one, both on white. The app now drops both as it reads (its checks keep only a kind's own
 * fields). It is here for tabs left open across a deploy, which would otherwise read no room
 * with a text box or a sticker in it, and can go after a release or two.
 */
const withPreviousBuildFields = (message: ServerMessage) => {
  const note = (n: WireNote) => {
    switch (n.kind) {
      case "memo":
      case "suggestion":
        return n;
      case "text":
        return { ...n, title: n.text, color: "#ffffff" };
      case "sticker":
        return { ...n, title: "", color: "#ffffff" };
    }
  };
  if (message.type === "snapshot") return { ...message, notes: message.notes.map(note) };
  if (message.type === "mutation" && message.mutation.type === "note:add")
    return { ...message, mutation: { ...message.mutation, note: note(message.mutation.note) } };
  return message;
};

/**
 * Whether `member`'s message is within RATE, counted in `counts`: a window starts at the first
 * message after the last one ended, and takes RATE.max messages
 */
export const withinRate = (
  counts: Map<MemberId, { since: number; n: number }>,
  member: MemberId,
): boolean => {
  const now = Date.now();
  const r = counts.get(member);
  if (r === undefined || now - r.since > RATE.window) {
    counts.set(member, { since: now, n: 1 });
    return true;
  }
  r.n++;
  return r.n <= RATE.max;
};

/**
 * The cids of a member's changes the room remembers, newest kept: a phone that lost an ack
 * resends the change, and is answered without writing it again. More than a socket ever has in
 * flight when it drops, offline replays included.
 */
const APPLIED_KEPT = 1000;

/** When the room wrote member `by`'s change `cid`; null when it has no such change kept */
export const appliedAt = (sql: SqlStorage, by: MemberId, cid: Cid): IsoInstant | null =>
  sql
    .exec<{ updated_at: IsoInstant }>(
      "SELECT updated_at FROM applied WHERE member = ? AND cid = ?",
      by,
      cid,
    )
    .toArray()[0]?.updated_at ?? null;

/** Keeps that member `by`'s change `cid` was written at `updatedAt`; the oldest past APPLIED_KEPT go */
export const keepApplied = (
  sql: SqlStorage,
  by: MemberId,
  cid: Cid,
  updatedAt: IsoInstant,
): void => {
  sql.exec("INSERT INTO applied (member, cid, updated_at) VALUES (?, ?, ?)", by, cid, updatedAt);
  sql.exec(
    `DELETE FROM applied WHERE member = ? AND rowid <= (
       SELECT rowid FROM applied WHERE member = ? ORDER BY rowid DESC LIMIT 1 OFFSET ?
     )`,
    by,
    by,
    APPLIED_KEPT,
  );
};
