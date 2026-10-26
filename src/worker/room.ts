import { DurableObject } from "cloudflare:workers";
import * as v from "valibot";

import { parserOf, type Result } from "../contract";
import { parseAirportCode } from "../contract/airport";
import { ImageIdSchema, type ImageId } from "../contract/image";
import { MemberIdSchema, parseMemberId, type MemberId } from "../contract/member";
import type { NoteId } from "../contract/note";
import { HEARTBEAT, KEPT_DAYS, RoomIdSchema, SEATS, type RoomId } from "../contract/room";
import {
  IsoInstantSchema,
  type Cid,
  type IsoDate,
  type IsoInstant,
  type ImageType,
  type Lang,
  type RejectReason,
  type UnreadReason,
  MAX_MESSAGE_BYTES,
  parseCid,
  parseMutation,
  type ServerMessage,
  type WireMember,
  type ProfileSchema,
  type WireRoomSummary,
  type WireTrip,
  type GoneReason,
} from "../contract/wire";

import { renderBooklet } from "./booklet";
import type { DraftContext, PlaceContext, SuggestContext, TagContext } from "./claude";
import {
  candidates,
  claimProposal,
  draftContext,
  placeContext,
  recordAgentCall,
  releaseProposal,
  saveCandidates,
  suggestContext,
  suggestionNote,
  tagContext,
} from "./room/agent";
import { apply, type Applied } from "./room/apply";
import { ON_DESK, readNote, readNotes } from "./room/notes";
import { migrate } from "./room/schema";
import { appliedAt, encode, keepApplied, withinRate } from "./room/socket";
import { hasImage, readMembers, readTrip } from "./room/state";

type MemberKind = WireMember["kind"];

/** Why no seat was held for an invitation: not the owner, every seat taken, or held for it already */
export type SeatRefusal = "not the owner" | "no seat" | "already invited";
/** Why a person may not be taken out: the owner never is, and only the owner takes another */
type RemoveRefusal = "the owner" | "not theirs";

/**
 * Why the room would not act for a member id the Worker resolved: it names no person in the
 * room's table (removed since the index was asked), or the room is deleted. The word the Worker
 * refuses anyone outside a room with, so the room's refusal is answered as that one
 */
export type Outsider = "not a member";

/**
 * A seat the room holds for an invitation, as the Worker minted it for the index to record
 * first; the index keeps whom it is for
 */
const SeatIdSchema = v.pipe(v.string(), v.uuid(), v.brand("SeatId"));
export type SeatId = v.InferOutput<typeof SeatIdSchema>;

/** A new seat's id */
export const newSeatId = (): SeatId => v.parse(SeatIdSchema, crypto.randomUUID());

/** A seat's id as the index kept it, read with its schema; null when it is not one */
export const parseSeatId = parserOf(SeatIdSchema);

/** The booklet the room has up: its slug, and when it was published */
type Published = { slug: string; at: IsoInstant };

/** A deleted room: its id, kept for the day it goes for good, and when it was deleted */
type Deletion = { room_id: RoomId; at: IsoInstant };

/** The room's refusal of someone it does not act for */
const OUTSIDE: { ok: false; reason: Outsider } = { ok: false, reason: "not a member" };

type Profile = v.InferOutput<typeof ProfileSchema>;

/**
 * A room: one trip, its notes, and the people and agent working on it. Holds
 * its member table keyed by member id; the Worker resolves the caller's e-mail
 * to an id in the index before anything reaches here, and the room acts only
 * for ids in its table. People and agents share the table, but only `create`
 * makes an agent: nobody can be invited as one.
 *
 * Every change arrives as a mutation over a member's socket. The room checks
 * it, stamps `by` and `updatedAt` itself, writes it, and tells the other sockets.
 */
export class Room extends DurableObject<Env> {
  static readonly MAX_PEOPLE = SEATS;
  // the one id that is the same in every room
  static readonly AGENT_ID = v.parse(MemberIdSchema, "agent:claude");
  static readonly MEMBER_HEADER = "X-Chirashitabi-Member";

  #rate = new Map<MemberId, { since: number; n: number }>();
  #dragRate = new Map<MemberId, { since: number; n: number }>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // the app's heartbeat (features/sync/socket.ts), answered without waking the room
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(HEARTBEAT.ping, HEARTBEAT.pong));
    migrate(ctx.storage);
  }

  // ---- pictures (RPC from the Worker; the bytes are in R2, the room keeps which it has) ----

  /** Pictures a room keeps at most; each is at most MAX_IMAGE_BYTES */
  static readonly MAX_IMAGES = 100;

  /**
   * How long a picture no card shows is kept: its form may still be open, or the card that
   * shows it may still be on its way from a device that was offline
   */
  static readonly UNUSED_AFTER = 24 * 60 * 60 * 1000;

  /**
   * Takes a picture member `by` is uploading into room `roomId`'s list, before its bytes are
   * written; the Worker has checked its type and size. Pictures no card shows, kept longer than
   * UNUSED_AFTER, go first, so a deleted card or a replaced photo gives its place back. Returns
   * its id, or why not: the room already holds as many as it may.
   */
  async addImage(
    by: MemberId,
    roomId: RoomId,
    type: ImageType,
    bytes: number,
  ): Promise<Result<ImageId, "full" | Outsider>> {
    if (this.outsider(by)) return OUTSIDE;
    const sql = this.ctx.storage.sql;
    // the bytes before the rows, so no row is dropped whose bytes may still be there, and nothing
    // else runs meanwhile, so no card takes a picture whose bytes are going. A delete that fails
    // leaves the rows, and the next upload tries again; it never throws here, which would reset
    // the room
    await this.ctx.blockConcurrencyWhile(async () => {
      const unused = sql
        .exec<{ id: ImageId }>(
          `SELECT id FROM pictures
           WHERE created_at < ? AND id NOT IN (
             SELECT image FROM ${ON_DESK} WHERE image IS NOT NULL
           )`,
          new Date(Date.now() - Room.UNUSED_AFTER).toISOString(),
        )
        .toArray()
        .map((p) => p.id);
      if (unused.length === 0) return;
      try {
        // R2 deletes up to 1000 keys a call; a room holds at most MAX_IMAGES
        await this.env.IMAGES.delete(unused.map((id) => imageKey(roomId, id)));
      } catch {
        return;
      }
      for (const id of unused) sql.exec("DELETE FROM pictures WHERE id = ?", id);
    });
    // deleted while the old pictures went: nothing more is written
    if (this.outsider(by)) return OUTSIDE;
    if (sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM pictures").one().n >= Room.MAX_IMAGES)
      return { ok: false, reason: "full" };
    const id = v.parse(ImageIdSchema, crypto.randomUUID());
    sql.exec(
      "INSERT INTO pictures (id, by, type, bytes, created_at) VALUES (?, ?, ?, ?, ?)",
      id,
      by,
      type,
      bytes,
      new Date().toISOString(),
    );
    return { ok: true, value: id };
  }

  /**
   * Its bytes could not be written in room `roomId`: the room does not have it after all. A put
   * that failed may still have landed, so the bytes go before the row; should they not go, the row
   * stays, unused, and the next upload's sweep takes both once it is UNUSED_AFTER old
   */
  async dropImage(roomId: RoomId, id: ImageId): Promise<void> {
    try {
      await this.env.IMAGES.delete(imageKey(roomId, id));
    } catch {
      return;
    }
    this.ctx.storage.sql.exec("DELETE FROM pictures WHERE id = ?", id);
  }

  /**
   * Whether the room still lists the picture `id`, asked once its bytes are written: a room
   * deleted since keeps it until it goes for good, and one gone for good (its storage deleted,
   * which this throws on) lists nothing, its bytes having landed after it listed what to delete
   */
  listsImage(id: ImageId): boolean {
    return hasImage(this.ctx.storage.sql, id);
  }

  /** Whether the room has a picture by that id, asked for member `by` */
  hasImageFor(by: MemberId, id: ImageId): Result<boolean, Outsider> {
    if (this.outsider(by)) return OUTSIDE;
    return { ok: true, value: hasImage(this.ctx.storage.sql, id) };
  }

  // ---- the public booklet (RPC from the Worker; its file is in R2, the room keeps its slug) ----

  /** The booklet the room has published, asked by member `by`: its slug and when; null for none */
  publication(by: MemberId): Result<Published | null, Outsider> {
    if (this.outsider(by)) return OUTSIDE;
    return { ok: true, value: this.published() };
  }

  /**
   * The owner `by` publishes the booklet as it is now, in `lang`, under a fresh slug, and the
   * one before goes: publishing again is how a link that went too far is taken back. The page
   * is written here from the room's own data (booklet.ts), so nothing a browser sends is on it.
   */
  async publish(by: MemberId, lang: Lang): Promise<Result<Published, "not the owner" | Outsider>> {
    if (this.outsider(by)) return OUTSIDE;
    if (by !== this.ownerId()) return { ok: false, reason: "not the owner" };
    // nothing else runs until the record names the file put up: two publishes at once (a double
    // tap), or a withdrawal or a deletion between, would leave up a file no record names
    return this.ctx.blockConcurrencyWhile(async () => {
      // the old file goes first: should anything after fail, the old link answers nothing, and the
      // record still names a slug whose file a retry deletes again (an R2 delete of none is fine)
      const before = this.published();
      if (before !== null) await this.env.IMAGES.delete(bookletKey(before.slug));
      const slug = newSlug();
      const at = stamp();
      const sql = this.ctx.storage.sql;
      await this.env.IMAGES.put(
        bookletKey(slug),
        renderBooklet(readTrip(sql), readNotes(sql), lang, at),
        {
          httpMetadata: { contentType: "text/html; charset=utf-8" },
        },
      );
      sql.exec(
        `INSERT INTO publication (id, slug, by, at) VALUES (1, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET slug = excluded.slug, by = excluded.by, at = excluded.at`,
        slug,
        by,
        at,
      );
      return { ok: true, value: { slug, at } };
    });
  }

  /** The owner `by` takes the booklet down: its link answers nothing from now on */
  async withdraw(by: MemberId): Promise<Result<void, "not the owner" | Outsider>> {
    if (this.outsider(by)) return OUTSIDE;
    if (by !== this.ownerId()) return { ok: false, reason: "not the owner" };
    // one at a time with a publish, as there
    await this.ctx.blockConcurrencyWhile(() => this.unpublish());
    return { ok: true, value: undefined };
  }

  /**
   * The published booklet goes, its file before its record: if the file cannot be deleted, the
   * record still names it, and the next try (or the alarm's) deletes it
   */
  private async unpublish(): Promise<void> {
    const p = this.published();
    if (p === null) return;
    await this.env.IMAGES.delete(bookletKey(p.slug));
    this.ctx.storage.sql.exec("DELETE FROM publication");
  }

  private published(): Published | null {
    const row = this.ctx.storage.sql
      .exec<{ slug: string; at: string }>("SELECT slug, at FROM publication")
      .toArray()[0];
    return row === undefined ? null : { slug: row.slug, at: v.parse(IsoInstantSchema, row.at) };
  }

  // ---- membership (RPC from the Worker) ----

  /** Sets the trip up, mints the creator and the room's agent; returns the creator's id */
  create(trip: WireTrip, me: Profile): MemberId {
    if (this.count() > 0) throw new Error("room already created");
    const sql = this.ctx.storage.sql;
    const creator = v.parse(MemberIdSchema, crypto.randomUUID());
    sql.exec(
      "INSERT INTO members (id, kind, creator, name, color) VALUES (?, 'person', 1, ?, ?)",
      creator,
      me.name,
      me.color,
    );
    sql.exec(
      "INSERT INTO members (id, kind, name, color) VALUES (?, 'agent', 'Claude', '#d97757')",
      Room.AGENT_ID,
    );
    sql.exec(
      "INSERT INTO trip (id, name, currency, center_lat, center_lng) VALUES (1, ?, ?, ?, ?)",
      trip.name,
      trip.currency,
      trip.center.lat,
      trip.center.lng,
    );
    trip.days.forEach((d, i) =>
      sql.exec("INSERT INTO days (date, position) VALUES (?, ?)", d.date, i),
    );
    return creator;
  }

  /**
   * The index would not record the room `create` just set up (its maker at their cap): nothing of
   * it is kept. It has no pictures, booklet or alarm yet, so its storage is all there is.
   */
  async discard(): Promise<void> {
    await this.ctx.storage.deleteAll();
  }

  /**
   * Whether the room acts for `by`, for a call that reads nothing else of it (a lookup, a fetch)
   * and so would otherwise go on the index's word alone, which may be behind
   */
  admits(by: MemberId): Result<void, Outsider> {
    return this.outsider(by) ? OUTSIDE : { ok: true, value: undefined };
  }

  /** Who made the room and so may invite, remove and delete; asked by member `by` */
  owner(by: MemberId): Result<MemberId, Outsider> {
    if (this.outsider(by)) return OUTSIDE;
    return { ok: true, value: this.ownerId() };
  }

  /**
   * How long a seat the index does not list is kept: an invitation is recorded in the index
   * before its seat is held here, and a membership is recorded there before its invitation goes,
   * so a seat held this long whose invitation and member the index lists neither was given back
   * there and lost here (a call that failed part way), and goes
   */
  static readonly UNLISTED_FOR = 60_000;

  /**
   * Holds the seat `seat` for someone the owner `by` invites, until they answer or the owner
   * takes it back; `listed` is what the index has of the room, its invitations' seats and its
   * members, read in one step. Refused when `by` is not the owner, when every seat is taken or
   * held, or when the seat is held already: asked again after a try whose answer was lost. A seat
   * the index lost is given back first: one held for nobody yet, and one taken by someone the
   * index does not record (a decline, a removal or a leave whose second step failed), who is
   * taken out with it, as `unaccept` does. The index keeps who the seat is for; the room keeps no
   * e-mail.
   */
  openSeat(
    by: MemberId,
    seat: SeatId,
    listed: { seats: SeatId[]; members: MemberId[] },
  ): Result<void, SeatRefusal | Outsider> {
    if (this.outsider(by)) return OUTSIDE;
    if (by !== this.ownerId()) return { ok: false, reason: "not the owner" };
    const sql = this.ctx.storage.sql;
    if (sql.exec("SELECT 1 FROM invitations WHERE id = ?", seat).toArray().length > 0)
      return { ok: false, reason: "already invited" };
    const lost = new Date(Date.now() - Room.UNLISTED_FOR).toISOString();
    const seats = new Set<string>(listed.seats);
    const members = new Set<string>(listed.members);
    for (const { id, member } of sql
      .exec<{ id: string; member: string | null }>(
        "SELECT id, member FROM invitations WHERE created_at < ?",
        lost,
      )
      .toArray()) {
      if (seats.has(id)) continue;
      const taken = member === null ? null : this.person(member);
      if (taken === null) sql.exec("DELETE FROM invitations WHERE id = ?", id);
      else if (!members.has(taken)) this.unaccept(taken);
    }
    const held = sql
      .exec<{ n: number }>("SELECT COUNT(*) AS n FROM invitations WHERE member IS NULL")
      .one().n;
    if (this.count("person") + held >= Room.MAX_PEOPLE) return { ok: false, reason: "no seat" };
    sql.exec(
      "INSERT INTO invitations (id, created_at) VALUES (?, ?)",
      seat,
      new Date().toISOString(),
    );
    return { ok: true, value: undefined };
  }

  /**
   * The seat is given back: declined, withdrawn, or not recorded after all. One taken by someone
   * the index never recorded (an acceptance that failed part way) takes them out with it, as
   * `unaccept` does; one given back already is nothing to give.
   */
  closeSeat(id: SeatId): void {
    const sql = this.ctx.storage.sql;
    const held = sql
      .exec<{ member: string | null }>("SELECT member FROM invitations WHERE id = ?", id)
      .toArray()[0];
    if (held === undefined) return;
    const taken = held.member === null ? null : this.person(held.member);
    if (taken === null) sql.exec("DELETE FROM invitations WHERE id = ?", id);
    else this.unaccept(taken);
  }

  /**
   * The invited person takes their seat as who they say they are; returns their new member id,
   * or why not: the seat is gone (withdrawn), or the room deleted. Everyone in is told. The seat
   * remembers whom it let in, so asked again for it (the index not told the first time) it
   * answers that member again rather than "no seat".
   */
  accept(seat: SeatId, me: Profile): Result<MemberId, "no seat" | "deleted"> {
    if (this.deletion() !== null) return { ok: false, reason: "deleted" };
    const sql = this.ctx.storage.sql;
    const held = sql
      .exec<{ member: string | null }>("SELECT member FROM invitations WHERE id = ?", seat)
      .toArray()[0];
    if (held === undefined) return { ok: false, reason: "no seat" };
    if (held.member !== null) {
      const taken = this.person(held.member);
      return taken === null ? { ok: false, reason: "no seat" } : { ok: true, value: taken };
    }
    const id = v.parse(MemberIdSchema, crypto.randomUUID());
    sql.exec(
      "INSERT INTO members (id, kind, name, color) VALUES (?, 'person', ?, ?)",
      id,
      me.name,
      me.color,
    );
    sql.exec("UPDATE invitations SET member = ? WHERE id = ?", id, seat);
    this.tellMembers();
    return { ok: true, value: id };
  }

  /**
   * The index would not record a member `accept` let in, or their invitation was given back
   * before it did: they are not in, and the seat is lost
   */
  unaccept(member: MemberId): void {
    const sql = this.ctx.storage.sql;
    sql.exec("DELETE FROM members WHERE id = ? AND creator = 0", member);
    sql.exec("DELETE FROM invitations WHERE member = ?", member);
    this.tellMembers();
  }

  /**
   * The room `roomId`, which the index hides as deleted since `marked`, as a person in it sees it,
   * to restore it; null for anyone else. Only the owner deletes, but either person can take it
   * back for its thirty days, unless the owner has it gone at once (docs/auth-and-security.md).
   * One the index hides and the room does not count as deleted is brought to agree: a deletion
   * whose room step failed is finished now, at the index's time, as `delete` would have; a restore
   * whose index step failed, the room having taken back that very deletion, is answered
   * "restored", for the Worker to show the room again. A deletion the room counts whose later
   * steps did not all go through is finished as well (`finishDeletion`); a step that throws again
   * is tried at the next ask, and the room is answered as deleted meanwhile, which it is.
   */
  async deletedFor(
    by: MemberId,
    roomId: RoomId,
    marked: IsoInstant,
  ): Promise<{ name: string; deletedAt: IsoInstant } | "restored" | null> {
    if (this.person(by) === null) return null;
    const sql = this.ctx.storage.sql;
    if (this.deletion() === null) {
      const restored = sql.exec<{ at: string }>("SELECT at FROM restored").toArray()[0];
      if (restored?.at === marked) return "restored";
    }
    await this.markDeleted(roomId, marked).catch(unfinished);
    const { name } = sql.exec<{ name: string }>("SELECT name FROM trip WHERE id = 1").one();
    return { name, deletedAt: this.deletion()?.at ?? marked };
  }

  /**
   * Whether `by` may take `member` out, as `remove` decides it, asked by the Worker before the
   * index forgets them: the owner may take anyone else, anyone else only themselves, and someone
   * leaving who is out already (an index row the room no longer honours) may go
   */
  mayRemove(by: MemberId, member: MemberId): Result<void, RemoveRefusal | Outsider> {
    if (by === member && this.person(by) === null && this.deletion() === null)
      return { ok: true, value: undefined };
    if (this.outsider(by)) return OUTSIDE;
    const owner = this.ownerId();
    if (member === owner) return { ok: false, reason: "the owner" };
    if (by !== owner && by !== member) return { ok: false, reason: "not theirs" };
    return { ok: true, value: undefined };
  }

  /**
   * Takes `member` out: the owner `by` removing someone else, or someone other than the owner
   * leaving (`by` is `member`). Refused for anything else; the owner never leaves their own
   * room, they delete it. Their notes stay; their socket is told and closed. The Worker has the
   * index forget them first, so someone this fails for is no longer let in and their seat is given
   * back at the next invitation (`openSeat`). Someone leaving who is out already (an index row the
   * room no longer honours) is answered as having left.
   */
  remove(by: MemberId, member: MemberId): Result<void, RemoveRefusal | "not in" | Outsider> {
    const may = this.mayRemove(by, member);
    if (!may.ok) return may;
    const sql = this.ctx.storage.sql;
    const gone = sql
      .exec("DELETE FROM members WHERE id = ? AND kind = 'person' RETURNING id", member)
      .toArray();
    if (gone.length === 0)
      return by === member ? { ok: true, value: undefined } : { ok: false, reason: "not in" };
    this.#rate.delete(member);
    this.#dragRate.delete(member);
    sql.exec("DELETE FROM applied WHERE member = ?", member);
    sql.exec("DELETE FROM invitations WHERE member = ?", member);
    this.closeSockets(this.ctx.getWebSockets(member), by === member ? "left" : "removed");
    this.tellMembers();
    return { ok: true, value: undefined };
  }

  /**
   * Whether `by` may delete the room, as `delete` decides it, asked by the Worker before the index
   * hides it: only its owner, and again after a try that failed part way, the room deleted already
   */
  mayDelete(by: MemberId): Result<void, "not the owner" | Outsider> {
    if (this.person(by) === null) return OUTSIDE;
    if (by !== this.ownerId()) return { ok: false, reason: "not the owner" };
    return { ok: true, value: undefined };
  }

  /**
   * The owner `by` deletes the room at `at`, the time the index hid it first: nobody can open it
   * from now on, and in DELETE_AFTER it is gone for good unless a person in it restores it.
   * `roomId` is kept for that day, when its pictures go too. Refused when `by` is not the owner.
   * Asked again after a try that failed part way, it keeps the first deletion's time and does the
   * rest again.
   */
  async delete(
    by: MemberId,
    roomId: RoomId,
    at: IsoInstant,
  ): Promise<Result<void, "not the owner" | Outsider>> {
    const may = this.mayDelete(by);
    if (!may.ok) return may;
    await this.markDeleted(roomId, at);
    return { ok: true, value: undefined };
  }

  /**
   * What deleting does, whoever it is finished for (`delete`, `deletedFor`): the room counts as
   * deleted at `at`, or at the first deletion's time when it did already, and the rest is done
   * again
   */
  private async markDeleted(roomId: RoomId, at: IsoInstant): Promise<void> {
    // deleted before anything is awaited: from here on nothing is written, opened or published
    this.ctx.storage.sql.exec(
      "INSERT OR IGNORE INTO deletion (id, room_id, at) VALUES (1, ?, ?)",
      roomId,
      at,
    );
    await this.finishDeletion();
  }

  /**
   * What deleting does once the room counts as deleted: its invitations go, its sockets are told
   * and closed, its day is set and its booklet taken down, in that order. Each step can be done
   * again, so a deleted room with no day set or a booklet still up (a step that threw, or an alarm
   * that ran out of retries) has them all done again, by `delete` asked again, by the list of
   * trips (`summary`, `deletedFor`), by `purge` and by the alarm; one with both is finished, and
   * nothing is done. Nothing for a room that is not deleted.
   */
  private async finishDeletion(): Promise<void> {
    const deletion = this.deletion();
    if (deletion === null) return;
    if ((await this.ctx.storage.getAlarm()) !== null && this.published() === null) return;
    this.ctx.storage.sql.exec("DELETE FROM invitations");
    this.closeSockets(this.ctx.getWebSockets(), "deleted");
    await this.ctx.storage.setAlarm(Date.parse(deletion.at) + Room.DELETE_AFTER);
    // a deleted trip's booklet is not left up for its thirty days; restoring does not bring it back
    await this.unpublish();
  }

  /** How long a deleted room can be restored: KEPT_DAYS, in milliseconds */
  static readonly DELETE_AFTER = KEPT_DAYS * 24 * 60 * 60 * 1000;

  /** When the room was deleted, or null while it is not */
  deletedAt(): IsoInstant | null {
    return this.deletion()?.at ?? null;
  }

  /**
   * A person in the room, `by`, takes the deletion back; refused when it is not deleted, which,
   * asked while the index still hides the room, means a try whose index call failed restored it,
   * and refused for anyone else. Which deletion it took back is kept, so `deletedFor` can tell a
   * restore whose index step failed from a deletion whose room step did.
   */
  restore(by: MemberId): Result<void, "not deleted" | Outsider> {
    const deletion = this.deletion();
    if (deletion === null) return { ok: false, reason: "not deleted" };
    if (this.person(by) === null) return OUTSIDE;
    const sql = this.ctx.storage.sql;
    sql.exec("DELETE FROM deletion");
    sql.exec("INSERT OR REPLACE INTO restored (id, at) VALUES (1, ?)", deletion.at);
    void this.ctx.storage.deleteAlarm();
    return { ok: true, value: undefined };
  }

  /**
   * A deleted room's day has come: its pictures, its place in the index and its storage go.
   * Alarms do nothing else (docs/auth-and-security.md); none of this is a paid call.
   */
  override async alarm(): Promise<void> {
    await this.sweep();
  }

  /** How long after an erase that did not go through the alarm tries again */
  static readonly ERASE_RETRY = 60 * 60 * 1000;

  /**
   * What the alarm does, callable on its own so the tests need not wait thirty days. Before the
   * day, what deleting does is finished should a step of it not have gone through, which sets the
   * day; on it, the next try is set first, so an erase that throws is tried again on its own
   */
  async sweep(): Promise<void> {
    const deletion = this.deletion();
    if (deletion === null) return;
    const due = Date.parse(deletion.at) + Room.DELETE_AFTER;
    if (Date.now() < due) {
      await this.finishDeletion();
      // and set again, whatever the alarm that woke this left
      await this.ctx.storage.setAlarm(due);
      return;
    }
    await this.ctx.storage.setAlarm(Date.now() + Room.ERASE_RETRY);
    await this.erase(deletion);
  }

  /**
   * The owner `by` wants the deleted room gone now rather than on its day: it goes as the
   * alarm would take it. Refused unless the room is deleted and `by` owns it; the other person
   * could still have restored it, so only the one who deleted it may end that. What deleting
   * does is finished first, so an erase that throws still leaves the room its day.
   */
  async purge(by: MemberId): Promise<Result<void, "not deleted" | "not the owner">> {
    const deletion = this.deletion();
    if (deletion === null) return { ok: false, reason: "not deleted" };
    if (by !== this.ownerId()) return { ok: false, reason: "not the owner" };
    await this.finishDeletion();
    await this.erase(deletion);
    return { ok: true, value: undefined };
  }

  /**
   * The room goes for good: its pictures, its booklet, its place in the index, its storage and its
   * alarm. Nothing else runs until it is gone: a restore in between would be answered yes for a
   * room about to go. Its pictures are whatever its folder in the bucket holds, listed or not: a
   * sweep, a failed upload or an upload racing this may have left bytes no row names.
   */
  private erase(deletion: Deletion): Promise<void> {
    return this.ctx.blockConcurrencyWhile(async () => {
      const prefix = imagesOf(deletion.room_id);
      let cursor: string | undefined;
      do {
        // a page holds up to 1000 keys, as many as R2 deletes a call
        const page = await this.env.IMAGES.list({ prefix, cursor });
        if (page.objects.length > 0) await this.env.IMAGES.delete(page.objects.map((o) => o.key));
        cursor = page.truncated ? page.cursor : undefined;
      } while (cursor !== undefined);
      await this.unpublish();
      await this.env.ROOMS.getByName("index").drop(deletion.room_id);
      await this.ctx.storage.deleteAlarm();
      await this.ctx.storage.deleteAll();
    });
  }

  /** The room's deletion as `delete` wrote it, read with its schemas; null while it is not deleted */
  private deletion(): Deletion | null {
    const row = this.ctx.storage.sql
      .exec<{ room_id: string; at: string }>("SELECT room_id, at FROM deletion")
      .toArray()[0];
    return row === undefined
      ? null
      : { room_id: v.parse(RoomIdSchema, row.room_id), at: v.parse(IsoInstantSchema, row.at) };
  }

  private ownerId(): MemberId {
    return this.ctx.storage.sql
      .exec<{ id: MemberId }>("SELECT id FROM members WHERE creator = 1")
      .one().id;
  }

  /** Who is in the room now, to every socket */
  private tellMembers(): void {
    const out = encode({
      type: "members",
      members: readMembers(this.ctx.storage.sql),
    });
    // a socket just closed on someone removed is still listed, and takes nothing more
    for (const ws of this.ctx.getWebSockets()) if (ws.readyState === WebSocket.OPEN) ws.send(out);
  }

  private closeSockets(sockets: WebSocket[], reason: GoneReason): void {
    const out = encode({ type: "gone", reason });
    for (const ws of sockets) {
      // one closed already (someone removed, still listed while it closes) would throw on send
      if (ws.readyState !== WebSocket.OPEN) continue;
      ws.send(out);
      ws.close(4001, reason);
    }
  }

  /**
   * The trip at a glance, for a member's list of rooms: its name, days, members and memo count;
   * for `by`, a person in it, or for an invitation (null). Null when `by` is not in the room (an
   * index row the room no longer honours), so the list leaves the room out; when the room is
   * deleted and the index not told (a build that told the room first), when it was, for the
   * Worker to tell the index, with what deleting does finished (`finishDeletion`; a step that
   * throws again is tried at the next ask)
   */
  async summary(
    by: MemberId | null = null,
  ): Promise<WireRoomSummary | { deletedAt: IsoInstant } | null> {
    if (by !== null && this.person(by) === null) return null;
    const deletion = this.deletion();
    if (deletion !== null) {
      await this.finishDeletion().catch(unfinished);
      return { deletedAt: deletion.at };
    }
    const sql = this.ctx.storage.sql;
    const { name } = sql.exec<{ name: string }>("SELECT name FROM trip WHERE id = 1").one();
    // a trip always has a day: made with one, and moved to one at least
    const { first } = sql
      .exec<{ first: IsoDate }>("SELECT date AS first FROM days ORDER BY position LIMIT 1")
      .one();
    const { days } = sql.exec<{ days: number }>("SELECT COUNT(*) AS days FROM days").one();
    // the people first, the creator leading; the agent after them
    const members = readMembers(sql)
      .sort((a, b) => Number(a.kind === "agent") - Number(b.kind === "agent"))
      .map(({ kind, name, color }) => ({ kind, name, color }));
    const { memos } = sql
      .exec<{ memos: number }>(`SELECT COUNT(*) AS memos FROM ${ON_DESK} WHERE kind = 'memo'`)
      .one();
    const owner = by !== null && by === this.ownerId();
    return { name, members, memos, owner, first, days };
  }

  // ---- the agent (RPC from the Worker, inside a member's request) ----

  /** What the agent needs to draft `date`, asked by member `by`; null when the trip has no such day */
  dayForDraft(by: MemberId, date: IsoDate): Result<DraftContext | null, Outsider> {
    if (this.outsider(by)) return OUTSIDE;
    const sql = this.ctx.storage.sql;
    return { ok: true, value: draftContext(readTrip(sql), readNotes(sql), date) };
  }

  // ---- places: where a memo is ----

  /** What naming a memo's place needs, asked by member `by`: which trip, and when */
  placeContext(by: MemberId): Result<PlaceContext, Outsider> {
    if (this.outsider(by)) return OUTSIDE;
    return { ok: true, value: placeContext(readTrip(this.ctx.storage.sql)) };
  }

  // ---- tags: the ones in use, and the agent's candidates for the trip ----

  /** What tagging a memo needs, asked by member `by`: the trip, the tags in use, the candidates */
  tagContext(by: MemberId): Result<TagContext & { candidates: string[] }, Outsider> {
    if (this.outsider(by)) return OUTSIDE;
    const sql = this.ctx.storage.sql;
    return { ok: true, value: tagContext(readTrip(sql), readNotes(sql), candidates(sql)) };
  }

  /**
   * How long a proposal of the candidates is waited for: one asked for longer ago was never
   * answered (its request died, or what came back was paid for and no proposal), and the next
   * ask may propose them
   */
  static readonly PROPOSING_FOR = 60_000;

  /**
   * Whether member `by` is the one to have the agent propose the trip's candidate tags: yes once
   * a trip, to the first who asks, and to nobody else while that proposal is on its way, so two
   * asks at once pay for one. Kept as proposed when it is saved, even with no tags in it; a
   * proposal that failed and was paid for is not saved, and is asked again after PROPOSING_FOR.
   * Nobody the room does not act for is the one.
   */
  claimProposal(by: MemberId): boolean {
    if (this.outsider(by)) return false;
    return claimProposal(this.ctx.storage.sql, Room.PROPOSING_FOR);
  }

  /**
   * The proposal claimed spent nothing (a provider's error, or past the budget): it is not made.
   * Nothing changes for anyone the room does not act for.
   */
  releaseProposal(by: MemberId): void {
    if (this.outsider(by)) return;
    releaseProposal(this.ctx.storage.sql);
  }

  /**
   * The agent's candidate tags, from an answer that was a proposal, kept so they are proposed
   * once a trip, not on every ask; none when it held no tag to keep. Nothing is kept for anyone
   * the room does not act for.
   */
  saveCandidates(by: MemberId, tags: string[]): void {
    if (this.outsider(by)) return;
    saveCandidates(this.ctx.storage.sql, tags);
  }

  /**
   * What the agent reads to suggest ideas, asked by member `by` from the note `about` (or from
   * none); null when that note is not on the desk, or has no words to start from
   */
  contextForSuggest(by: MemberId, about: NoteId | null): Result<SuggestContext | null, Outsider> {
    if (this.outsider(by)) return OUTSIDE;
    const sql = this.ctx.storage.sql;
    return { ok: true, value: suggestContext(readTrip(sql), readNotes(sql), about) };
  }

  /**
   * The agent's ideas as suggestion cards, written as the agent (never as the member who
   * asked) around `at` on the desk, and sent to every socket, the asker's too: nobody made
   * them on their own device. Returns how many were written.
   */
  addSuggestions(
    by: MemberId,
    titles: string[],
    at: { x: number; y: number },
  ): Result<number, Outsider> {
    if (this.outsider(by)) return OUTSIDE;
    const now = stamp();
    let added = 0;
    titles.forEach((title, i) => {
      const note = suggestionNote(title, i, at, Room.AGENT_ID, now);
      const result = apply(this.ctx.storage.sql, { type: "note:add", note }, Room.AGENT_ID, now);
      if (!result.ok) return;
      added++;
      const out = encode({
        type: "mutation",
        mutation: result.value,
        by: Room.AGENT_ID,
        updatedAt: now,
      });
      for (const ws of this.ctx.getWebSockets()) if (ws.readyState === WebSocket.OPEN) ws.send(out);
    });
    return { ok: true, value: added };
  }

  /**
   * The ledger of the agent's paid calls: who asked, when, for what and how many tokens, for
   * tracing a surprising bill. Member ids only, never an e-mail. Nothing is written for anyone
   * the room does not act for: a call that answers after its asker was removed, or after the room
   * was deleted and gone, leaves nothing behind.
   */
  recordAgentCall(by: MemberId, what: string, tokens: { input: number; output: number }): void {
    if (this.outsider(by)) return;
    recordAgentCall(this.ctx.storage.sql, by, what, tokens);
  }

  // ---- the socket ----

  /**
   * The WebSocket upgrade. A socket cannot cross an RPC call, so this is the one
   * thing that arrives as a request; the Worker has resolved the member and says
   * who it is in a header nothing outside the Worker can set.
   */
  override fetch(request: Request): Response {
    const asked = request.headers.get(Room.MEMBER_HEADER);
    if (request.headers.get("Upgrade") !== "websocket" || asked === null) {
      return new Response("Bad Request", { status: 400 });
    }
    // removed or deleted between the index's answer and here
    const memberId = this.person(asked);
    if (memberId === null || this.deletion() !== null)
      return new Response("Forbidden", { status: 403 });
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server, [memberId]);
    server.send(encode(this.snapshot(memberId)));
    return new Response(null, { status: 101, webSocket: client });
  }

  override webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    const tag = this.ctx.getTags(ws)[0];
    const by = tag === undefined ? null : this.person(tag);
    if (by === null) return ws.close(1008, "no member");
    // sent while the room was being deleted: nothing more is written
    if (this.deletion() !== null) return this.closeSockets([ws], "deleted");
    // the client's id for this mutation, once it is known: an answer names it
    let cid: Cid | null = null;
    // what could not be read names no cid; what was read and refused names it when it had one
    const unread = (reason: UnreadReason) => ws.send(encode({ type: "unread", reason }));
    const reject = (reason: RejectReason) =>
      ws.send(
        encode({
          type: "rejected",
          reason,
          ...(cid === null ? {} : { cid }),
        }),
      );

    if (typeof message !== "string") return unread("text only");
    // its size in bytes, as the limit is; a string's length counts UTF-16 units
    if (new TextEncoder().encode(message).byteLength > MAX_MESSAGE_BYTES)
      return unread("too large");

    let parsed: unknown;
    try {
      parsed = JSON.parse(message);
    } catch {
      return unread("not JSON");
    }
    cid = parseCid(parsed);
    const updatedAt = stamp();
    const mutation = parseMutation(parsed, { by, updatedAt }, parseAirportCode);
    // a card on its way under a finger is relayed, not kept; letting go sends the move with a cid
    const dragging = cid === null && mutation?.type === "note:move";
    // and is not answered: one past the window, or of a card already gone, is dropped, the next
    // one or the snapshot after saying where everything is
    if (!withinRate(dragging ? this.#dragRate : this.#rate, by)) {
      if (!dragging) reject("too many messages");
      return;
    }
    if (mutation === null) return reject("not a mutation");

    const sql = this.ctx.storage.sql;
    // sent again by a phone that never heard the answer: answered as before, and not written over
    // what came since
    if (cid !== null) {
      const again = appliedAt(sql, by, cid);
      if (again !== null) return ws.send(encode({ type: "ack", cid, updatedAt: again }));
    }

    if (dragging && readNote(sql, mutation.id) === undefined) return;
    const result: Applied = dragging
      ? { ok: true, value: mutation }
      : apply(sql, mutation, by, updatedAt);
    if (!result.ok) return reject(result.reason);

    if (cid !== null) {
      ws.send(encode({ type: "ack", cid, updatedAt }));
      keepApplied(sql, by, cid, updatedAt);
    }

    const out = encode({
      type: "mutation",
      mutation: result.value,
      by,
      updatedAt,
    });
    // a socket closing (someone removed) is still listed, and would throw on send
    for (const other of this.ctx.getWebSockets())
      if (other !== ws && other.readyState === WebSocket.OPEN) other.send(out);
  }

  override webSocketClose(ws: WebSocket, code: number, reason: string): void {
    // 1005, 1006 and 1015 say what the other end could not (no code, a dropped line, TLS): none
    // may be sent, and close() throws on them
    if (![1005, 1006, 1015].includes(code)) ws.close(code, reason);
  }

  // ---- state ----

  snapshot(me: MemberId): ServerMessage {
    const sql = this.ctx.storage.sql;
    return {
      type: "snapshot",
      me,
      members: readMembers(sql),
      trip: readTrip(sql),
      notes: readNotes(sql),
    };
  }

  private count(kind?: MemberKind): number {
    const sql = this.ctx.storage.sql;
    const row =
      kind === undefined
        ? sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM members").one()
        : sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM members WHERE kind = ?", kind).one();
    return row.n;
  }

  /**
   * Whether the room does not act for `id`: it acts only for a person in its table, in a room
   * that is not deleted. Its refusal (OUTSIDE) is an answer, not a throw, so the Worker tells it
   * apart from a failure
   */
  private outsider(id: MemberId): boolean {
    return this.person(id) === null || this.deletion() !== null;
  }

  /** The person `id` names in the room's table, as an id read with its schema; null for none */
  private person(id: string): MemberId | null {
    const row = this.ctx.storage.sql
      .exec<{ id: string }>("SELECT id FROM members WHERE id = ? AND kind = 'person'", id)
      .toArray()[0];
    return row === undefined ? null : parseMemberId(row.id);
  }
}

/** The room's own folder in the bucket: one room's ids never reach another's pictures */
export const imagesOf = (roomId: RoomId) => `rooms/${roomId}/images/`;

/** Where a room's picture is in the bucket, in its folder */
export const imageKey = (roomId: RoomId, id: ImageId) => `${imagesOf(roomId)}${id}`;

/** Where a published booklet is in the bucket; its slug is its only name */
export const bookletKey = (slug: string) => `booklets/${slug}/shiori.html`;

/** A booklet's slug: 16 random bytes, base64url, 22 characters, so its link cannot be guessed */
export const newSlug = () =>
  btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

/** A step of what deleting does threw where the room answers anyway: it is done again next time */
const unfinished = (e: unknown) =>
  console.warn("room: what deleting does is not finished, and is done again at the next ask", {
    error: String(e),
  });

/** Now, as the room stamps what it applies */
const stamp = (): IsoInstant => v.parse(IsoInstantSchema, new Date().toISOString());
