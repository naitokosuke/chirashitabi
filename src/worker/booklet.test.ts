import * as v from "valibot";
import { describe, expect, test } from "vite-plus/test";

import { makeWireMemo } from "../contract/fixtures";
import { WireTripSchema } from "../contract/wire";

import { escapeHtml, renderBooklet } from "./booklet";

const trip = v.parse(WireTripSchema, {
  name: "Taiwan <trip>",
  days: [
    { date: "2026-11-03", intro: "Dumplings first" },
    { date: "2026-11-04", intro: "" },
  ],
  currency: "TWD",
  center: { lat: 25, lng: 121.5 },
  flights: {
    out: {
      number: "BR 191",
      from: "HND",
      to: "TSA",
      departs: "2026-11-03T08:50",
      arrives: "2026-11-03T11:30",
    },
    back: { number: "", from: "TSA", to: "HND", departs: null, arrives: null },
  },
  stays: [
    {
      name: 'Hotel "Proverbs"',
      checkIn: "2026-11-03",
      nights: 1,
      mapsUrl: "https://maps.google.com/?q=hotel",
      pin: null,
    },
  ],
});

const memo = (id: string, extra: Parameters<typeof makeWireMemo>[1] = {}) =>
  makeWireMemo(id, { color: "#ffd9de", ...extra });

describe("renderBooklet", () => {
  const notes = [
    memo("anytime", { schedule: { date: "2026-11-03", time: null, status: "fixed" } }),
    memo("dinner", {
      schedule: { date: "2026-11-03", time: "19:00", status: "done" },
      pin: { lat: 25.05, lng: 121.52 },
    }),
    memo("lunch", {
      schedule: { date: "2026-11-03", time: "12:30", status: "fixed" },
      minutes: 600,
    }),
    memo("maybe", { schedule: { date: "2026-11-03", time: "15:00", status: "idea" } }),
    memo("loose", {}),
  ];
  const html = renderBooklet(trip, notes, "ja", "2026-10-16T04:00:00Z");

  test("a day's confirmed notes by time, the rest after; maybes and notes with no day stay out", () => {
    const order = [...html.matchAll(/<h3>([^<]+)<\/h3>/g)].map((m) => m[1]);
    expect(order).toEqual(["lunch", "dinner", "anytime"]);
    // a timed note says when it ends
    expect(html).toContain("12:30–22:30");
    expect(html).toContain('<li class="note pink" data-done>');
  });

  test("the day's flights and its night's stay head it; a flight with no time is the last day's", () => {
    const [, day1 = "", day2 = ""] = html.split("<section>");
    expect(day1).toContain("<b>行き</b> BR 191 HND 08:50 → TSA 11:30");
    expect(day1).toContain(
      '<b>今夜の宿</b> <a href="https://maps.google.com/?q=hotel" rel="noopener noreferrer" target="_blank">Hotel &quot;Proverbs&quot;</a>',
    );
    expect(day1).toContain('<p class="intro">Dumplings first</p>');
    expect(day2).toContain("<b>帰り</b> TSA → HND");
    expect(day2).not.toContain("今夜の宿");
  });

  test("a pin with no link is a link to Google Maps at it; the trip's name is escaped", () => {
    expect(html).toContain('href="https://www.google.com/maps?q=25.05,121.52"');
    expect(html).toContain("<h1>Taiwan &lt;trip&gt;</h1>");
    expect(html).not.toMatch(/<script|style="/);
  });
});

describe("escapeHtml", () => {
  test("every character that could open markup or close an attribute", () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&</a>`)).toBe(
      "&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;",
    );
  });
});
