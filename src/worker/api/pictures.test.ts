import * as v from "valibot";
import { describe, expect, test } from "vite-plus/test";

import { ImageIdSchema } from "../../contract/image";
import { MemberIdSchema } from "../../contract/member";
import { NoteIdSchema } from "../../contract/note";
import { COLORS, MAX_TEXT, MAX_TITLE } from "../../contract/room";
import { COORD, IsoInstantSchema, MAX_SCALE, MIN_SCALE } from "../../contract/wire";

import {
  APP,
  connect,
  createRoom,
  fetchImage,
  me,
  memo,
  refusal,
  roomStorage,
  server,
  token,
  useWorker,
} from "./harness";

useWorker();

describe("pictures", () => {
  /** A few bytes standing in for a WebP: the Worker checks the type it is told, not the bytes */
  const BYTES = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4]);
  const upload = async (
    roomId: string,
    email: string,
    body: Uint8Array<ArrayBuffer> = BYTES,
    headers: Record<string, string> = {},
  ) =>
    server.fetch(`${APP}/api/rooms/${roomId}/images`, {
      method: "POST",
      headers: {
        "Cf-Access-Jwt-Assertion": await token(email),
        Origin: APP,
        "Content-Type": "image/webp",
        ...headers,
      },
      body,
    });

  test("a member's picture is kept and shown to members only, kept by the browser for good", async () => {
    const email = "photos@example.com";
    const { roomId } = await createRoom(email);
    const res = await upload(roomId, email);
    expect(res.status).toBe(200);
    const { id } = (await res.json()) as { id: string };

    // an <img> sends no Origin
    const got = await fetchImage(roomId, id, email);
    expect(got.status).toBe(200);
    expect(got.headers.get("Content-Type")).toBe("image/webp");
    expect(got.headers.get("Cache-Control")).toContain("immutable");
    expect(new Uint8Array(await got.arrayBuffer())).toEqual(BYTES);

    expect(await refusal(await fetchImage(roomId, id, "stranger-photos@example.com"))).toEqual([
      403,
      { error: "not a member" },
    ]);
    expect((await fetchImage(roomId, "not-an-id", email)).status).toBe(404);
    expect((await fetchImage(roomId, crypto.randomUUID(), email)).status).toBe(404);
  });

  test("an upload must come from the app, as a picture, within the size", async () => {
    const email = "badphotos@example.com";
    const { roomId } = await createRoom(email);
    expect((await upload(roomId, email, BYTES, { Origin: "https://evil.example" })).status).toBe(
      403,
    );
    expect((await upload(roomId, email, BYTES, { "Content-Type": "image/svg+xml" })).status).toBe(
      415,
    );
    expect((await upload(roomId, email, new Uint8Array(1024 * 1024 + 1))).status).toBe(413);
    expect((await upload(roomId, email, new Uint8Array(0))).status).toBe(400);
    expect((await upload(roomId, "outsider-photos@example.com")).status).toBe(403);
  });

  test("an upload that does not say how long it is is read as it comes, up to the size", async () => {
    const email = "streamphotos@example.com";
    const { roomId } = await createRoom(email);
    // two chunks of 64 KiB, with no Content-Length: read whole, as the size allows. How far one
    // past the size is read is readUpTo's to show (preview.test.ts): refused before its end, its
    // connection is closed, and the harness would send the next test's request down it
    const res = await server.fetch(`${APP}/api/rooms/${roomId}/images`, {
      method: "POST",
      headers: {
        "Cf-Access-Jwt-Assertion": await token(email),
        Origin: APP,
        "Content-Type": "image/webp",
      },
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          for (let i = 0; i < 2; i++) controller.enqueue(new Uint8Array(64 * 1024));
          controller.close();
        },
      }),
      duplex: "half",
    });
    expect(res.status).toBe(200);
    const { id } = (await res.json()) as { id: string };
    const kept = await fetchImage(roomId, id, email);
    expect((await kept.arrayBuffer()).byteLength).toBe(128 * 1024);
  });

  test("a card shows only a picture the room has, and can lose it", async () => {
    const email = "cardphoto@example.com";
    const { roomId } = await createRoom(email);
    const { id } = (await (await upload(roomId, email)).json()) as { id: string };
    const a = await connect(roomId, email);

    a.send({ type: "note:add", note: { ...memo("n1"), image: crypto.randomUUID() }, cid: "c1" });
    expect(await a.next()).toMatchObject({ type: "rejected", reason: "no such image", cid: "c1" });

    a.send({ type: "note:add", note: { ...memo("n1"), image: id }, cid: "c2" });
    expect((await a.next()).type).toBe("ack");
    a.send({ type: "note:update", id: "n1", patch: { image: null }, cid: "c3" });
    expect((await a.next()).type).toBe("ack");
    a.ws.close(1000, "done");

    // a client from before pictures sends no image; the card has none
    const b = await connect(roomId, email);
    const n1 =
      b.snapshot.type === "snapshot" ? b.snapshot.notes.find((n) => n.id === "n1") : undefined;
    expect(n1).toMatchObject({ kind: "memo", image: null });
    b.ws.close(1000, "done");
  });

  test("a sticker is a picture the room has, stuck on the desk, moved and taken away", async () => {
    const email = "stickers@example.com";
    const { roomId } = await createRoom(email);
    const { id } = (await (await upload(roomId, email)).json()) as { id: string };
    const a = await connect(roomId, email);
    const sticker = (image: unknown) => ({
      id: "s1",
      kind: "sticker",
      x: 5,
      y: 6,
      rot: -3,
      scale: 1,
      image,
    });

    a.send({ type: "note:add", note: sticker(null), cid: "c1" });
    expect(await a.next()).toMatchObject({ type: "rejected", reason: "not a mutation", cid: "c1" });
    a.send({ type: "note:add", note: sticker(crypto.randomUUID()), cid: "c2" });
    expect(await a.next()).toMatchObject({ type: "rejected", reason: "no such image", cid: "c2" });
    a.send({ type: "note:add", note: sticker(id), cid: "c3" });
    expect((await a.next()).type).toBe("ack");
    a.send({ type: "note:move", id: "s1", x: 50, y: 60, rot: 10, scale: 2, cid: "c4" });
    expect((await a.next()).type).toBe("ack");
    // it has no fields of a memo's to change
    a.send({ type: "note:update", id: "s1", patch: { title: "x" }, cid: "c5" });
    expect(await a.next()).toMatchObject({ type: "rejected", reason: "not a memo", cid: "c5" });
    // nor any paper to color
    a.send({ type: "note:recolor", id: "s1", color: "#ffd9de", cid: "c5b" });
    expect(await a.next()).toMatchObject({ type: "rejected", reason: "not on paper", cid: "c5b" });

    const b = await connect(roomId, email);
    expect(b.snapshot.notes).toEqual([
      {
        id: "s1",
        kind: "sticker",
        image: id,
        x: 50,
        y: 60,
        rot: 10,
        scale: 2,
        // beside it, what a tab on the previous build reads
        title: "",
        color: "#ffffff",
        by: expect.any(String),
        updatedAt: expect.any(String),
      },
    ]);
    // the room's list counts memos, not stickers
    expect((await me(email)).rooms).toMatchObject([{ memos: 0 }]);
    a.send({ type: "note:delete", id: "s1", cid: "c6" });
    expect((await a.next()).type).toBe("ack");
    const c = await connect(roomId, email);
    expect(c.snapshot).toMatchObject({ notes: [] });

    // a client from before each kind had only its own fields sends a blank title and white
    // paper with it: stuck all the same, and kept without them; told with them, for tabs on the
    // previous build
    a.send({
      type: "note:add",
      note: { ...sticker(id), id: "s2", title: "", color: "#ffffff" },
      cid: "c7",
    });
    expect((await a.next()).type).toBe("ack");
    const told = await c.next();
    expect(told.type === "mutation" && told.mutation).toEqual({
      type: "note:add",
      note: {
        ...sticker(id),
        id: "s2",
        title: "",
        color: "#ffffff",
        by: expect.any(String),
        updatedAt: expect.any(String),
      },
    });
    for (const s of [a, b, c]) s.ws.close(1000, "done");
  });

  test("a tab on the previous build reads a room with a text box and a sticker in it", async () => {
    // the previous build's notes, as its contract checked them (memos, unchanged, left out): a
    // title and a color on every kind, a text box's words its title
    const finite = (max = COORD) =>
      v.pipe(v.number(), v.finite(), v.minValue(-max), v.maxValue(max));
    const card = {
      id: NoteIdSchema,
      title: v.pipe(v.string(), v.maxLength(MAX_TITLE)),
      color: v.picklist(COLORS),
      x: finite(),
      y: finite(),
      rot: finite(360),
      scale: v.optional(
        v.pipe(v.number(), v.finite(), v.minValue(MIN_SCALE), v.maxValue(MAX_SCALE)),
        1,
      ),
    };
    const stamped = { by: MemberIdSchema, updatedAt: IsoInstantSchema };
    const words = v.pipe(v.string(), v.maxLength(MAX_TEXT), v.trim(), v.nonEmpty());
    const PreviousNoteSchema = v.variant("kind", [
      v.object({ ...card, ...stamped, kind: v.literal("suggestion") }),
      v.object({ ...card, ...stamped, kind: v.literal("text"), title: words }),
      v.object({ ...card, ...stamped, kind: v.literal("sticker"), image: ImageIdSchema }),
    ]);

    const email = "previous-build@example.com";
    const { roomId } = await createRoom(email);
    const { id } = (await (await upload(roomId, email)).json()) as { id: string };
    const a = await connect(roomId, email);
    const placed = { x: 5, y: 6, rot: 0, scale: 1 };
    a.send({
      type: "note:add",
      note: { ...placed, id: "t1", kind: "text", text: "Day 1" },
      cid: "c1",
    });
    expect((await a.next()).type).toBe("ack");
    a.send({
      type: "note:add",
      note: { ...placed, id: "s1", kind: "sticker", image: id },
      cid: "c2",
    });
    expect((await a.next()).type).toBe("ack");

    const b = await connect(roomId, email);
    expect(v.parse(v.array(PreviousNoteSchema), b.snapshot.notes)).toMatchObject([
      { id: "t1", kind: "text", title: "Day 1", color: "#ffffff" },
      { id: "s1", kind: "sticker", title: "", color: "#ffffff", image: id },
    ]);
    for (const s of [a, b]) s.ws.close(1000, "done");
  });

  test("a picture no card shows gives its place back a day on, at the next upload", async () => {
    const email = "unused-photos@example.com";
    const { roomId } = await createRoom(email);
    const kept = async () => ((await (await upload(roomId, email)).json()) as { id: string }).id;
    const shown = await kept();
    const dropped = await kept();
    const recent = await kept();
    const a = await connect(roomId, email);
    a.send({ type: "note:add", note: { ...memo("n1"), image: shown }, cid: "c1" });
    expect((await a.next()).type).toBe("ack");
    a.ws.close(1000, "done");

    // the first two were uploaded two days ago; the third may still be in an open form
    const worker = server.getWorker();
    const storage = await roomStorage(roomId);
    const env = await worker.getEnv();
    const old = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    await storage.exec(
      `UPDATE pictures SET created_at = '${old}' WHERE id IN ('${shown}', '${dropped}')`,
    );
    expect((await upload(roomId, email)).status).toBe(200);

    expect((await fetchImage(roomId, shown, email)).status).toBe(200);
    expect((await fetchImage(roomId, recent, email)).status).toBe(200);
    expect((await fetchImage(roomId, dropped, email)).status).toBe(404);
    expect(await env.IMAGES.head(`rooms/${roomId}/images/${dropped}`)).toBeNull();
  });

  test("a deleted card's picture gives its place back too", async () => {
    const email = "deleted-card-photo@example.com";
    const { roomId } = await createRoom(email);
    const { id } = (await (await upload(roomId, email)).json()) as { id: string };
    const a = await connect(roomId, email);
    a.send({ type: "note:add", note: { ...memo("n1"), image: id }, cid: "c1" });
    expect((await a.next()).type).toBe("ack");
    a.send({ type: "note:delete", id: "n1", cid: "c2" });
    expect((await a.next()).type).toBe("ack");
    a.ws.close(1000, "done");

    const storage = await roomStorage(roomId);
    const old = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    await storage.exec(`UPDATE pictures SET created_at = '${old}' WHERE id = '${id}'`);
    expect((await upload(roomId, email)).status).toBe(200);
    expect((await fetchImage(roomId, id, email)).status).toBe(404);
  });
});
