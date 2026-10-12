import type { Temporal } from "temporal-polyfill-lite";

import type { MemberId } from "../members/types";
import type { ImageId, Scheduled } from "../notes/types";
import type { FoundPlace, LatLng } from "../place/types";

/** A suggested order and times for one day, from whichever member drafted it */
export interface DayDraft {
  by: MemberId;
  reason: string; // why this order
  items: { note: Scheduled; time: Temporal.PlainTime | null }[];
  intro: string;
}

/** What the Cloudflare Worker will do for the room, besides sync */
export interface WorkerApi {
  /**
   * Have the room's agent leave a few ideas as suggestion cards around `at` on the desk; they
   * reach the room like any change. Resolves with how many it left
   */
  suggest(at: { x: number; y: number }): Promise<number>;
  /**
   * Keep a picture in the room (shrunk on the device first, notes/image.ts); resolves with its
   * id for a card to show
   */
  uploadImage(image: Blob): Promise<ImageId>;
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
    chosen: string[];
  }): Promise<{ tag: string; p: number; isNew: boolean }[]>;
  /**
   * The trip's candidate tags the agent proposed, none before the first ask for tags; free,
   * so the form ranks them with the tags in use as the words are typed
   */
  tagCandidates(): Promise<string[]>;
  /**
   * Where a memo is: the room's agent names the place from its words, and OpenStreetMap finds
   * it, so the points are real ones. Up to three to choose from, none when the memo is not
   * about a place
   */
  findPlaces(memo: {
    title: string;
    body: string;
    tags: string[];
    lang: "ja" | "en";
  }): Promise<FoundPlace[]>;
  /**
   * What is at a point pinned on the map, from OpenStreetMap: the place there or the street,
   * named in `lang`; null when it has nothing there. Free, so not budgeted
   */
  whereIs(at: LatLng, lang: "ja" | "en"): Promise<FoundPlace | null>;
  /** Places by a name typed as it is (a stay's), from OpenStreetMap only. Free, so not budgeted */
  findByName(query: string, lang: "ja" | "en"): Promise<FoundPlace[]>;
  /**
   * The Google Maps link a short one (`maps.app.goo.gl/…`) stands for, so its point can be
   * read; any other link, or one that does not say, comes back as it was. When it leads to a
   * place's name and not its point, `at` is where OpenStreetMap finds that name. Budgeted
   */
  expandLink(url: string, lang: "ja" | "en"): Promise<{ url: string; at: LatLng | null }>;
  /** Have a member order a day's notes and give them times */
  draftDay(date: Temporal.PlainDate, notes: Scheduled[]): Promise<DayDraft>;
  /**
   * Publish the booklet as a static page at /r/<slug>/shiori, with a fresh slug each time;
   * null while the Worker cannot, and the UI hides it
   */
  exportBooklet: (() => Promise<void>) | null;
}
