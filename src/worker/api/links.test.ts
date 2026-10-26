import { describe, expect, test } from "vite-plus/test";

import {
  APP,
  budgetLeft,
  createRoom,
  fetched,
  followed,
  PER_DAY,
  post,
  server,
  STRANGER,
  token,
  useWorker,
} from "./harness";

useWorker();

describe("a link's preview", () => {
  const ask = (roomId: string, email: string, url: string) =>
    post(`/api/rooms/${roomId}/preview`, email, { url });

  test("a page's Open Graph, its picture kept by the room; the call is budgeted", async () => {
    const PREVIEWER = "previewer@example.com";
    const { roomId } = await createRoom(PREVIEWER);
    const res = await ask(roomId, PREVIEWER, "https://blog.example.com/post");
    expect(res.status).toBe(200);
    const { preview } = (await res.json()) as { preview: Record<string, unknown> };
    expect(preview).toMatchObject({
      url: "https://blog.example.com/post",
      site: "blog.example.com",
      title: "Beef noodles & more",
      description: "A bowl worth the queue",
    });
    expect(typeof preview.image).toBe("string");
    // the picture is the room's now, served to its members like any
    const img = await server.fetch(`${APP}/api/rooms/${roomId}/images/${preview.image as string}`, {
      headers: { "Cf-Access-Jwt-Assertion": await token(PREVIEWER) },
    });
    expect(img.status).toBe(200);
    expect(img.headers.get("content-type")).toBe("image/png");
    // the budget counted it
    expect(await budgetLeft(roomId, PREVIEWER)).toBe(PER_DAY - 1);
  });

  test("a redirect is followed to the page", async () => {
    const MOVER = "mover@example.com";
    const { roomId } = await createRoom(MOVER);
    const moved = (await (await ask(roomId, MOVER, "https://blog.example.com/moved")).json()) as {
      preview: { title: string } | null;
    };
    expect(moved.preview?.title).toBe("Beef noodles & more");
    expect(fetched.some((f) => f.host === "blog.example.com" && f.path === "/post")).toBe(true);
  });

  test("a page in another encoding than UTF-8 is read in its own", async () => {
    const READER = "sjis@example.com";
    const { roomId } = await createRoom(READER);
    const sjis = (await (await ask(roomId, READER, "https://blog.example.com/sjis")).json()) as {
      preview: { title: string } | null;
    };
    expect(sjis.preview?.title).toBe("ラーメン");
  });

  test("YouTube through its oEmbed; a picture too large is left out; what is no page is no preview", async () => {
    const TUBER = "tuber@example.com";
    const { roomId } = await createRoom(TUBER);
    const yt = (await (await ask(roomId, TUBER, "https://youtu.be/abc")).json()) as {
      preview: Record<string, unknown>;
    };
    expect(yt.preview).toMatchObject({
      site: "youtube.com",
      title: "Night market walk",
      description: "Some Channel",
    });
    expect(typeof yt.preview.image).toBe("string");
    // the bar-free 16:9 frame was asked for, the largest first and then the one every video has
    const frames = fetched.filter((f) => f.host === "i.ytimg.com").map((f) => f.path);
    expect(frames).toEqual(["/vi/abc/maxresdefault.jpg", "/vi/abc/mqdefault.jpg"]);
    // each ask is one of the day's few in the tests: the rest on accounts of their own
    const BIG = "bigpic@example.com";
    const { roomId: bigRoom } = await createRoom(BIG);
    const big = (await (await ask(bigRoom, BIG, "https://blog.example.com/bigpic")).json()) as {
      preview: Record<string, unknown>;
    };
    expect(big.preview).toMatchObject({ title: "Big", image: null });
    const NONE = "nopage@example.com";
    const { roomId: noneRoom } = await createRoom(NONE);
    for (const url of ["https://files.example.com/a.pdf", "https://10.0.0.1/x"]) {
      const none = (await (await ask(noneRoom, NONE, url)).json()) as { preview: unknown };
      expect(none.preview).toBeNull();
    }
    expect((await post(`/api/rooms/${noneRoom}/preview`, NONE, {})).status).toBe(400);
  });
});

describe("a short Google Maps link", () => {
  const expandLink = (roomId: string, email: string, body: unknown) =>
    post(`/api/rooms/${roomId}/expand`, email, body);

  test("is asked of its host, within the person's budget; one that leads nowhere comes back as it was", async () => {
    const email = "expand@example.com";
    const { roomId } = await createRoom(email);
    const seen = followed.length;
    const short = "https://maps.app.goo.gl/AbC123";
    const res = await expandLink(roomId, email, { url: short });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: short, at: null });
    expect(followed.slice(seen)).toEqual(["/AbC123"]);
    // each expansion is a fetch the person asked for: it spends from the day's budget
    for (let i = 1; i < PER_DAY; i++)
      expect((await expandLink(roomId, email, { url: "https://maps.app.goo.gl/x" })).status).toBe(
        200,
      );
    expect((await expandLink(roomId, email, { url: "https://maps.app.goo.gl/x" })).status).toBe(
      429,
    );
  });

  test("a link that is not a short one comes back as it was, fetched by no one and free", async () => {
    const email = "expand2@example.com";
    const { roomId } = await createRoom(email);
    const seen = followed.length;
    const long = "https://www.google.com/maps/place/x/@25.04,121.55,17z";
    for (let i = 0; i <= PER_DAY; i++)
      expect(await (await expandLink(roomId, email, { url: long })).json()).toEqual({
        url: long,
        at: null,
      });
    expect(followed.length).toBe(seen);
    expect((await expandLink(roomId, email, { url: 42 })).status).toBe(400);
    expect((await expandLink(roomId, STRANGER, { url: long })).status).toBe(403);
  });
});

describe("a preview that is never fetched", () => {
  test("is no preview, and costs nothing of the budget", async () => {
    const email = "unfetched@example.com";
    const { roomId } = await createRoom(email);
    const seen = fetched.length;
    for (const url of ["javascript:alert(1)", "https://10.0.0.1/x", "https://chirashitabi.app/x"])
      expect(await (await post(`/api/rooms/${roomId}/preview`, email, { url })).json()).toEqual({
        preview: null,
      });
    expect(fetched.length).toBe(seen);
    expect(await budgetLeft(roomId, email)).toBe(PER_DAY);
  });
});
