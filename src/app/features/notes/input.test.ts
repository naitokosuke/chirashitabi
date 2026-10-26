import { Temporal } from "temporal-polyfill-lite";

import { describe, expect, test } from "vite-plus/test";

import { parseHttpUrl } from "../place/google-maps";

import {
  blankInput,
  bookingDraft,
  bookingOf,
  changes,
  chosenBooking,
  parseNoteText,
  tooMuchOf,
} from "./input";
import type { Booking } from "./types";

describe("parseNoteText", () => {
  test("a #tag in the title becomes a tag and leaves the title", () => {
    expect(parseNoteText("Din Tai Fung #Food")).toEqual({
      title: "Din Tai Fung",
      body: "",
      tags: ["Food"],
    });
  });

  test("a #tag in the body leaves the body too, and the spacing closes up", () => {
    expect(parseNoteText("Lunch\nmain shop #Food   has a queue\n#Taipei")).toEqual({
      title: "Lunch",
      body: "main shop has a queue",
      tags: ["Food", "Taipei"],
    });
  });

  test("a #word too long for a tag stays in the words, as the room would keep no such tag", () => {
    const long = "x".repeat(41);
    expect(parseNoteText(`Lunch #${long} #Food`)).toEqual({
      title: `Lunch #${long}`,
      body: "",
      tags: ["Food"],
    });
  });

  test("a title that is only tags keeps its words, so the note is never blank", () => {
    expect(parseNoteText("#Packing")).toEqual({ title: "#Packing", body: "", tags: ["Packing"] });
  });

  test("Japanese text and full-width spaces pass through", () => {
    expect(parseNoteText("鼎泰豊で小籠包 #ごはん\n11時に並ぶ")).toEqual({
      title: "鼎泰豊で小籠包",
      body: "11時に並ぶ",
      tags: ["ごはん"],
    });
  });
});

describe("tooMuchOf", () => {
  const tags = (n: number) =>
    parseNoteText(Array.from({ length: n }, (_, i) => `#t${i}`).join(" "));

  test("words the room keeps, up to each limit, are not too much", () => {
    expect(tooMuchOf(parseNoteText(`${"x".repeat(200)}\n${"y".repeat(4000)}`))).toBeNull();
    expect(tooMuchOf({ ...tags(20), title: "Tags" })).toBeNull();
  });

  test("a first line longer than a title, a body longer than a body, more tags than a memo holds", () => {
    expect(tooMuchOf(parseNoteText("x".repeat(201)))).toBe("title");
    expect(tooMuchOf(parseNoteText(`Title\n${"y".repeat(4001)}`))).toBe("body");
    expect(tooMuchOf({ ...tags(21), title: "Tags" })).toBe("tags");
  });
});

describe("changes", () => {
  const opened = {
    ...blankInput([], { lat: 25, lng: 121 }),
    title: "Lunch",
    booking: { state: "needed" as const, by: Temporal.PlainDate.from("2026-11-01") },
  };

  test("only the fields changed go: the rest stay what the room has", () => {
    expect(changes(opened, { ...opened, title: "Dinner", minutes: 60 })).toEqual({
      title: "Dinner",
      minutes: 60,
    });
  });

  test("fields built anew but the same are no change", () => {
    const same = {
      ...opened,
      tags: [...opened.tags],
      pin: { lat: 25, lng: 121 },
      booking: { state: "needed" as const, by: Temporal.PlainDate.from("2026-11-01") },
    };
    expect(changes(opened, same)).toEqual({});
    expect(changes(opened, { ...same, booking: null })).toEqual({ booking: null });
  });
});

describe("booking fields", () => {
  test("a booking comes back the same from its fields", () => {
    const needed: Booking = { state: "needed", by: Temporal.PlainDate.from("2026-11-01") };
    const booked: Booking = {
      state: "booked",
      code: "AB12",
      url: parseHttpUrl("https://x.test/b"),
    };
    expect(bookingOf(bookingDraft(null))).toBeNull();
    expect(bookingOf(bookingDraft(needed))).toEqual(needed);
    expect(bookingOf(bookingDraft(booked))).toEqual(booked);
  });

  test("a choice starts blank, and blank fields say no day and no page", () => {
    expect(bookingOf(chosenBooking("needed"))).toEqual({ state: "needed", by: null });
    expect(bookingOf(chosenBooking("booked"))).toEqual({ state: "booked", code: "", url: null });
    expect(chosenBooking("anything")).toEqual({ state: "none" });
  });

  test("the number is trimmed, and a page that is no http(s) link is none", () => {
    expect(bookingOf({ state: "booked", code: " AB12 ", url: "ftp://x.test" })).toEqual({
      state: "booked",
      code: "AB12",
      url: null,
    });
  });
});
