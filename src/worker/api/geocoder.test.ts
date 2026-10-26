import { describe, expect, test } from "vite-plus/test";

import {
  asked,
  budgetLeft,
  createRoom,
  looked,
  PER_DAY,
  post,
  STRANGER,
  stub,
  useWorker,
} from "./harness";

useWorker();

describe("finding a memo's place", () => {
  const naming = (queries: string[]) => ({
    status: 200,
    body: {
      content: [{ type: "tool_use", id: "t1", name: "name_place", input: { queries } }],
      usage: { input_tokens: 40, output_tokens: 12 },
    },
  });
  const NINGXIA = {
    name: "寧夏夜市",
    display_name: "寧夏夜市, 寧夏路, 大同區, 臺北市, 103, 臺灣",
    lat: "25.0563",
    lon: "121.5154",
    extratags: { opening_hours: "Mo-Su 17:00-01:00\n" },
  };
  const ask = (roomId: string, email: string, body: unknown) =>
    post(`/api/rooms/${roomId}/places`, email, body);

  test("Claude names the place, the geocoder finds it; the coordinates are the geocoder's", async () => {
    const email = "finder@example.com";
    const { roomId } = await createRoom(email);
    stub.answer = () => naming(["寧夏夜市, 臺北市, 臺灣", "Ningxia Night Market, Taipei"]);
    stub.find = (q) => ({
      status: 200,
      body: q.startsWith("寧夏") ? [NINGXIA, { display_name: "x" }] : [],
    });
    const calls = asked.length;
    const seen = looked.length;

    const res = await ask(roomId, email, {
      title: "寧夏夜市 グルメ食べ歩き",
      body: "",
      tags: ["夜市"],
      lang: "ja",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      places: [
        {
          name: "寧夏夜市",
          address: "寧夏路, 大同區, 臺北市, 103, 臺灣",
          lat: 25.0563,
          lng: 121.5154,
          // its opening hours as OpenStreetMap tags them, on one line
          hours: "Mo-Su 17:00-01:00",
        },
      ],
    });
    // one paid call; one lookup (the first query found it), identified, in the asker's language
    expect(asked.length).toBe(calls + 1);
    expect(looked.slice(seen)).toEqual([
      { q: "寧夏夜市, 臺北市, 臺灣", lang: "ja", agent: expect.stringContaining("chirashitabi") },
    ]);
    const prompt = (asked.at(-1) as { messages: { content: string }[] }).messages[0]!.content;
    expect(prompt).toContain("寧夏夜市 グルメ食べ歩き");
    expect(prompt).toContain("Taiwan trip");
  });

  test("the second query is tried only when the first finds nothing", async () => {
    const email = "finder2@example.com";
    const { roomId } = await createRoom(email);
    stub.answer = () => naming(["nowhere at all", "Ningxia Night Market, Taipei"]);
    stub.find = (q) => ({ status: 200, body: q.startsWith("Ningxia") ? [NINGXIA] : [] });
    const seen = looked.length;
    const res = await ask(roomId, email, { title: "night market", body: "", tags: [], lang: "en" });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { places: unknown[] }).places).toHaveLength(1);
    expect(looked.slice(seen).map((l) => l.q)).toEqual([
      "nowhere at all",
      "Ningxia Night Market, Taipei",
    ]);
  });

  test("a memo about no place finds none, and the geocoder is not asked", async () => {
    const email = "finder3@example.com";
    const { roomId } = await createRoom(email);
    stub.answer = () => naming([]);
    const seen = looked.length;
    const res = await ask(roomId, email, {
      title: "pack sunscreen",
      body: "",
      tags: [],
      lang: "ja",
    });
    expect(await res.json()).toEqual({ places: [] });
    expect(looked.length).toBe(seen);
  });

  test("an empty memo is refused before anything is paid; a geocoder that fails is a 502", async () => {
    const email = "finder4@example.com";
    const { roomId } = await createRoom(email);
    const calls = asked.length;
    expect((await ask(roomId, email, { title: "  ", body: "" })).status).toBe(400);
    expect(asked.length).toBe(calls);

    stub.answer = () => naming(["寧夏夜市, 臺北市, 臺灣"]);
    stub.find = () => ({ status: 503, body: {} });
    expect((await ask(roomId, email, { title: "寧夏夜市", body: "" })).status).toBe(502);
  });

  test("a provider error costs nothing, and the geocoder is not asked", async () => {
    const email = "finder6@example.com";
    const { roomId } = await createRoom(email);
    stub.answer = () => ({ status: 529, body: { type: "error" } });
    const seen = looked.length;
    expect((await ask(roomId, email, { title: "寧夏夜市", body: "" })).status).toBe(502);
    expect(looked.length).toBe(seen);
    expect(await budgetLeft(roomId, email)).toBe(PER_DAY);
  });

  test("only members may ask", async () => {
    const { roomId } = await createRoom("finder5@example.com");
    expect((await ask(roomId, STRANGER, { title: "寧夏夜市" })).status).toBe(403);
  });
});

describe("what is at a pinned point", () => {
  const where = (roomId: string, email: string, body: unknown) =>
    post(`/api/rooms/${roomId}/where`, email, body);

  test("the place at the point, named in the asker's language, at the point itself; no paid call", async () => {
    const email = "where@example.com";
    const { roomId } = await createRoom(email);
    let asked_at: URL | null = null;
    stub.find = (_, url) => {
      asked_at = url;
      return {
        status: 200,
        body: {
          name: "鼎泰豐 信義店",
          display_name: "鼎泰豐 信義店, 信義路二段, 大安區, 臺北市, 臺灣",
          lat: "25.0336",
          lon: "121.5300",
        },
      };
    };
    const calls = asked.length;
    const res = await where(roomId, email, { lat: 25.03361, lng: 121.53005, lang: "en" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      place: {
        name: "鼎泰豐 信義店",
        address: "信義路二段, 大安區, 臺北市, 臺灣",
        lat: 25.03361,
        lng: 121.53005,
        hours: null,
      },
    });
    expect(asked.length).toBe(calls);
    const url = asked_at as unknown as URL;
    expect(url.pathname).toBe("/reverse");
    expect(url.searchParams.get("extratags")).toBe("1");
    expect(url.searchParams.get("lat")).toBe("25.03361");
    expect(url.searchParams.get("accept-language")).toBe("en");
  });

  test("a point with no name of its own takes its street's, never a bare house number", async () => {
    const email = "where3@example.com";
    const { roomId } = await createRoom(email);
    stub.find = () => ({
      status: 200,
      body: {
        name: "",
        display_name: "36號, 寧夏路, 大同區, 臺北市, 103, 臺灣",
        address: { house_number: "36號", road: "寧夏路", suburb: "大同區", city: "臺北市" },
        lat: "25.0561",
        lon: "121.5152",
      },
    });
    expect(await (await where(roomId, email, { lat: 25.056188, lng: 121.515222 })).json()).toEqual({
      place: {
        name: "寧夏路",
        address: "大同區, 臺北市, 103, 臺灣",
        lat: 25.056188,
        lng: 121.515222,
        hours: null,
      },
    });
  });

  test("nothing there is an answer; a bad point is refused; a geocoder that fails is a 502", async () => {
    const email = "where2@example.com";
    const { roomId } = await createRoom(email);
    stub.find = () => ({ status: 200, body: { error: "Unable to geocode" } });
    expect(await (await where(roomId, email, { lat: 10, lng: 150 })).json()).toEqual({
      place: null,
    });
    expect((await where(roomId, email, { lat: 91, lng: 0 })).status).toBe(400);
    expect((await where(roomId, email, { lat: "25", lng: 121 })).status).toBe(400);
    stub.find = () => ({ status: 503, body: {} });
    expect((await where(roomId, email, { lat: 25, lng: 121 })).status).toBe(502);
    expect((await where(roomId, STRANGER, { lat: 25, lng: 121 })).status).toBe(403);
  });
});

describe("places by a typed name", () => {
  const findByName = (roomId: string, email: string, body: unknown) =>
    post(`/api/rooms/${roomId}/find`, email, body);

  test("OpenStreetMap is asked the name, in the asker's language; no paid call, no budget", async () => {
    const email = "find@example.com";
    const { roomId } = await createRoom(email);
    stub.find = (q) => ({
      status: 200,
      body:
        q === "Hotel Proverbs Taipei"
          ? [
              {
                name: "Hotel Proverbs",
                display_name: "Hotel Proverbs, 大安路一段, 臺北市",
                lat: "25.0416",
                lon: "121.5489",
              },
            ]
          : [],
    });
    const calls = asked.length;
    const seen = looked.length;
    for (let i = 0; i <= PER_DAY; i++) {
      const res = await findByName(roomId, email, { query: " Hotel Proverbs Taipei ", lang: "en" });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        places: [
          {
            name: "Hotel Proverbs",
            address: "大安路一段, 臺北市",
            lat: 25.0416,
            lng: 121.5489,
            hours: null,
          },
        ],
      });
    }
    expect(asked.length).toBe(calls);
    expect(looked[seen]).toMatchObject({ q: "Hotel Proverbs Taipei", lang: "en" });
  });

  test("a blank or overlong name is refused; a geocoder that fails is a 502; a stranger is not let in", async () => {
    const email = "find2@example.com";
    const { roomId } = await createRoom(email);
    expect((await findByName(roomId, email, { query: "  " })).status).toBe(400);
    expect((await findByName(roomId, email, { query: "x".repeat(201) })).status).toBe(400);
    stub.find = () => ({ status: 503, body: {} });
    expect((await findByName(roomId, email, { query: "Inn" })).status).toBe(502);
    expect((await findByName(roomId, STRANGER, { query: "Inn" })).status).toBe(403);
  });
});
