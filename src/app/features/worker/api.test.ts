import * as v from "valibot";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";

import { RoomIdSchema } from "../rooms/types";

import { refused, roomWorkerApi } from "./api";

const ROOM = v.parse(RoomIdSchema, "b082573b-b38b-4298-90be-f034f8b7d898");

/** What a refused call answers: JSON naming the refusal, as the Worker's routes write it */
const refusal = <E extends string>(error: E) => ({ json: async () => ({ error }) });
const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** The Worker, answering every call with `res` */
function answer(res: Response) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => res),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("refused", () => {
  test("a call's own refusal is returned by the word the Worker answered", async () => {
    expect(await refused(refusal("no seat"))).toEqual({ ok: false, reason: "no seat" });
    expect(await refused(refusal("the owner"), "not in")).toEqual({
      ok: false,
      reason: "the owner",
    });
  });

  test("the room's refusal of an outsider is told as the word the call gives for it", async () => {
    expect(await refused(refusal("not a member"), "not in")).toEqual({
      ok: false,
      reason: "not in",
    });
    expect(await refused(refusal("not a member"), "not deleted")).toEqual({
      ok: false,
      reason: "not deleted",
    });
  });

  test("given no word for an outsider, the Worker's own stands", async () => {
    expect(await refused(refusal("not a member"))).toEqual({ ok: false, reason: "not a member" });
  });

  test("a 403 from before the room, plain text, is not a refusal: it throws", async () => {
    await expect(refused(new Response("Forbidden", { status: 403 }))).rejects.toThrow();
  });
});

describe("roomWorkerApi", () => {
  const picture = new Blob(["picture"], { type: "image/webp" });

  test("a room with no space left for a picture is refused as full", async () => {
    answer(json({ error: "full" }, 409));
    expect(await roomWorkerApi(ROOM).uploadImage(picture)).toEqual({
      ok: false,
      reason: { kind: "full" },
    });
  });

  test("a paid call past the budget is refused with the ceiling it met", async () => {
    answer(json({ error: "over budget", ceiling: "day" }, 429));
    expect(
      await roomWorkerApi(ROOM).suggestTags({ title: "", body: "", image: null, chosen: [] }),
    ).toEqual({ ok: false, reason: { kind: "over", ceiling: "day" } });
    answer(json({ error: "over budget", ceiling: "trip" }, 429));
    expect(await roomWorkerApi(ROOM).preview("https://example.com/")).toEqual({
      ok: false,
      reason: { kind: "over", ceiling: "trip" },
    });
  });

  test("an answer the call does not expect is an error, not a refusal", async () => {
    answer(json({ error: "not a member" }, 403));
    await expect(roomWorkerApi(ROOM).uploadImage(picture)).rejects.toThrow("403");
    answer(new Response("", { status: 500 }));
    await expect(roomWorkerApi(ROOM).preview("https://example.com/")).rejects.toThrow("500");
  });

  test("a free call has no budget to meet: a 429 is an error like any other", async () => {
    answer(json({ error: "over budget", ceiling: "day" }, 429));
    await expect(roomWorkerApi(ROOM).tagCandidates()).rejects.toThrow("429");
  });
});
