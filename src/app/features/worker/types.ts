import type { Temporal } from "temporal-polyfill-lite";

import type { hc, InferResponseType } from "hono/client";

import type { Locale } from "../../i18n/locale";

import type { Api } from "../../../../.worker-types/worker";
import type { Result } from "../../../contract";
import type { MemberId } from "../members/types";
import type { ImageId, NoteId } from "../notes/id";
import type { Scheduled, Tag } from "../notes/types";
import type { HttpUrl } from "../place/google-maps";
import type { FoundPlace, LatLng } from "../place/types";

/** A room's calls as the app's client (hc) has them, typed by the Worker's routes */
type RoomCalls = ReturnType<typeof hc<Api>>["api"]["rooms"][":roomId"];

/** What a room's call answers when it went (200), as its route on the Worker says */
type Answer<Call> = Call extends { $post: infer Post } ? InferResponseType<Post, 200> : never;

/** A suggested order and times for one day, from whichever member drafted it */
export interface DayDraft {
  /** Who drafted it, as the Worker names them: an id to find among the members; null when it named none */
  by: MemberId | null;
  reason: string; // why this order
  /** Each note in order, when it starts and how long it takes there (null: not said) */
  items: { note: Scheduled; time: Temporal.PlainTime | null; minutes: number | null }[];
  intro: string;
}

/** The budget declined a paid call (docs/auth-and-security.md): asking again will not help */
export type OverBudget = { kind: "over"; ceiling: "day" | "trip" };
/** The room already keeps as many pictures as it may */
type RoomFull = { kind: "full" };

/** What the Cloudflare Worker will do for the room, besides sync */
export interface WorkerApi {
  /**
   * Have the room's agent leave a few ideas as suggestion cards around `at` on the desk; they
   * reach the room like any change. `ask` is what the member asked for in their words (blank
   * for anything), `about` the note they asked from. Resolves with how many it left
   */
  suggest(request: {
    at: { x: number; y: number };
    ask: string;
    about: NoteId | null;
  }): Promise<Result<number, OverBudget>>;
  /**
   * Keep a picture in the room (shrunk on the device first, notes/image.ts); resolves with its
   * id for a card to show
   */
  uploadImage(image: Blob): Promise<Result<ImageId, RoomFull>>;
  /**
   * Tags that fit a memo as it is being written, judged by Clef on its words and its picture,
   * from the tags in use and the trip's candidates (proposed by the agent once). Every tag
   * Clef judged, with `p`, how likely it fits, the likeliest first; `isNew` is a tag no note
   * has yet
   */
  suggestTags(memo: {
    title: string;
    body: string;
    image: ImageId | null;
    chosen: Tag[];
  }): Promise<Result<Answer<RoomCalls["tags"]>["tags"], OverBudget>>;
  /**
   * The trip's candidate tags the agent proposed, none before the first ask for tags; free,
   * so the form ranks them with the tags in use as the words are typed
   */
  tagCandidates(): Promise<Answer<RoomCalls["candidates"]>["tags"]>;
  /**
   * Where a memo is: the room's agent names the place from its words, and OpenStreetMap finds
   * it, so the points are real ones. Up to three to choose from, none when the memo is not
   * about a place
   */
  findPlaces(memo: {
    title: string;
    body: string;
    tags: string[];
    lang: Locale;
  }): Promise<Result<FoundPlace[], OverBudget>>;
  /**
   * What is at a point pinned on the map, from OpenStreetMap: the place there or the street,
   * named in `lang`; null when it has nothing there. Free, so not budgeted
   */
  whereIs(at: LatLng, lang: Locale): Promise<FoundPlace | null>;
  /** Places by a name typed as it is (a stay's), from OpenStreetMap only. Free, so not budgeted */
  findByName(query: string, lang: Locale): Promise<FoundPlace[]>;
  /**
   * The Google Maps link a short one (`maps.app.goo.gl/…`) stands for, so its point can be
   * read; any other link, or one that does not say, comes back as it was. When it leads to a
   * place's name and not its point, `at` is where OpenStreetMap finds that name. Budgeted
   */
  expandLink(url: string, lang: Locale): Promise<Result<Answer<RoomCalls["expand"]>, OverBudget>>;
  /** Have a member order a day's notes and give them times */
  draftDay(date: Temporal.PlainDate, notes: Scheduled[]): Promise<Result<DayDraft, OverBudget>>;
  /**
   * What the page at `url` says of itself, for a note that links to it: its title, a line and
   * its picture, which the room keeps as one of its pictures. Null when the page says nothing
   * (or is no page). Budgeted
   */
  preview(url: string): Promise<Result<LinkPreview | null, OverBudget>>;
  /** The room's booklet as a public page while one is up, else null. Free */
  publication(): Promise<Publication | null>;
  /**
   * The owner puts the booklet up as a public page as it is now, in `lang`, at a new link; the
   * link before stops answering. Budgeted
   */
  publish(lang: Locale): Promise<Result<Publication, OverBudget>>;
  /** The owner takes the public page down */
  withdraw(): Promise<void>;
}

/**
 * A page as it describes itself, with its picture already the room's: where it is after any
 * redirect, its site ("youtube.com"), its title, a line and its picture, as the Worker says
 */
type LinkPreview = NonNullable<Answer<RoomCalls["preview"]>["preview"]>;

/** The booklet as a public page: where anyone with the link reads it, and as of when */
export interface Publication {
  url: HttpUrl;
  at: Temporal.Instant;
}
