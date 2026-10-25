import * as v from "valibot";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";

import { RoomIdSchema } from "../rooms/types";

import { invite, leaveRoom } from "./api";
import { EmailSchema } from "./types";

const ROOM = v.parse(RoomIdSchema, "b082573b-b38b-4298-90be-f034f8b7d898");
const KEN = v.parse(EmailSchema, "ken@example.com");

/** The Worker, answering every call with `res` */
function answer(res: Response) {
  const fetch = vi.fn(async () => res);
  vi.stubGlobal("fetch", fetch);
}
const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a change of who is in", () => {
  test("went", async () => {
    answer(json({ invited: KEN }, 200));
    expect(await invite(ROOM, KEN)).toEqual({ ok: true, value: undefined });
  });

  test("returns the room's refusal, by the word it answered", async () => {
    answer(json({ error: "no seat" }, 409));
    expect(await invite(ROOM, KEN)).toEqual({ ok: false, reason: "no seat" });
    answer(json({ error: "the owner" }, 403));
    expect(await leaveRoom(ROOM)).toEqual({ ok: false, reason: "the owner" });
  });

  test("asked by someone no longer in the room, says they are not in it", async () => {
    answer(json({ error: "not a member" }, 403));
    expect(await invite(ROOM, KEN)).toEqual({ ok: false, reason: "not in" });
    answer(json({ error: "not a member" }, 403));
    expect(await leaveRoom(ROOM)).toEqual({ ok: false, reason: "not in" });
  });

  test("throws for a 403 that is no refusal, and for any other answer", async () => {
    answer(new Response("Forbidden", { status: 403 }));
    await expect(leaveRoom(ROOM)).rejects.toThrow();
    answer(new Response("oops", { status: 500 }));
    await expect(invite(ROOM, KEN)).rejects.toThrow();
  });
});
