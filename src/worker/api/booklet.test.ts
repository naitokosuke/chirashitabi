import { describe, expect, test } from "vite-plus/test";

import {
  admit,
  budgetLeft,
  connect,
  createRoom,
  memo,
  PER_DAY,
  post,
  refusal,
  server,
  TRIP,
  useWorker,
} from "./harness";

useWorker();

describe("the public booklet", () => {
  const OWNER = "publisher@example.com";
  const GUEST = "reader@example.com";
  const page = (url: string) => server.fetch(url);

  /** A room of OWNER's with GUEST in it, and one confirmed memo with things that stay private */
  async function roomWithPlan(owner = OWNER, guest = GUEST) {
    const { roomId } = await createRoom(owner);
    await admit(roomId, owner, guest);
    const a = await connect(roomId, owner);
    const note = {
      ...memo("n1", "<script>alert(1)</script> Din Tai Fung"),
      body: "Queue & all",
      schedule: { date: TRIP.days[0], time: "12:30", status: "fixed" },
      minutes: 90,
      budget: 4321,
      booking: { state: "booked", code: "SECRET-CODE", url: "https://example.com/private" },
    };
    a.send({ type: "note:add", note, cid: "c1" });
    expect((await a.next()).type).toBe("ack");
    a.ws.close(1000, "done");
    return roomId;
  }

  test("the owner publishes the plan as a page with no script, nothing private, escaped", async () => {
    const roomId = await roomWithPlan();
    const before = await post(`/api/rooms/${roomId}/publication`, GUEST);
    expect(await before.json()).toEqual({ publication: null });

    const res = await post(`/api/rooms/${roomId}/publish`, OWNER, { lang: "en" });
    expect(res.status).toBe(200);
    const { publication } = (await res.json()) as { publication: { url: string; at: string } };
    expect(publication.url).toMatch(
      /^https:\/\/shiori\.chirashitabi\.app\/r\/[A-Za-z0-9_-]{22}\/shiori$/,
    );

    // the other person sees it is up, and where
    const seen = await post(`/api/rooms/${roomId}/publication`, GUEST);
    expect(await seen.json()).toEqual({ publication });

    const shown = await page(publication.url);
    expect(shown.status).toBe(200);
    expect(shown.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(shown.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(shown.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    const html = await shown.text();
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; Din Tai Fung");
    expect(html).not.toContain("<script");
    expect(html).toContain("Queue &amp; all");
    expect(html).toContain("12:30–14:00");
    for (const secret of ["SECRET-CODE", "example.com/private", "4321", "Yuki", "Ken"])
      expect(html).not.toContain(secret);
  });

  test("only the owner publishes or takes it down; publishing again moves it", async () => {
    const roomId = await roomWithPlan();
    expect((await post(`/api/rooms/${roomId}/publish`, GUEST, { lang: "ja" })).status).toBe(403);
    const first = (await (
      await post(`/api/rooms/${roomId}/publish`, OWNER, { lang: "ja" })
    ).json()) as {
      publication: { url: string };
    };
    const again = (await (
      await post(`/api/rooms/${roomId}/publish`, OWNER, { lang: "ja" })
    ).json()) as {
      publication: { url: string };
    };
    expect(again.publication.url).not.toBe(first.publication.url);
    expect((await page(first.publication.url)).status).toBe(404);
    expect((await page(again.publication.url)).status).toBe(200);

    expect((await post(`/api/rooms/${roomId}/withdraw`, GUEST)).status).toBe(403);
    expect((await post(`/api/rooms/${roomId}/withdraw`, OWNER)).status).toBe(200);
    expect((await page(again.publication.url)).status).toBe(404);
    const after = await post(`/api/rooms/${roomId}/publication`, GUEST);
    expect(await after.json()).toEqual({ publication: null });
  });

  test("publishing twice at once, or withdrawing meanwhile, leaves up only the file on record", async () => {
    const { roomId, memberId: owner } = await createRoom("racer@example.com");
    const env = await server.getWorker().getEnv();
    // the room's own calls, each on a stub of its own so they run side by side: no budget
    const room = () => env.ROOM.getByName(roomId);
    const publish = async () => {
      const published = (await room().publish(owner, "ja")) as { value: { slug: string } };
      return published.value.slug;
    };
    // taps in a row, then a publish and a withdrawal crossing
    const tapped = await Promise.all([publish(), publish(), publish()]);
    const [crossed] = await Promise.all([publish(), room().withdraw(owner)]);
    const on = await room().publication(owner);
    for (const slug of [...tapped, crossed])
      expect((await env.IMAGES.head(`booklets/${slug}/shiori.html`)) !== null).toBe(
        slug === on?.slug,
      );
  });

  test("a publish counts against the owner's budget; a member who is not the owner spends nothing", async () => {
    const SPENDER = "spender@example.com";
    const READER = "budget-reader@example.com";
    const roomId = await roomWithPlan(SPENDER, READER);
    const refused = await post(`/api/rooms/${roomId}/publish`, READER, { lang: "ja" });
    expect(await refusal(refused)).toEqual([403, { error: "not the owner" }]);
    expect((await post(`/api/rooms/${roomId}/publish`, SPENDER, { lang: "ja" })).status).toBe(200);
    expect(await budgetLeft(roomId, SPENDER)).toBe(PER_DAY - 1);
    expect(await budgetLeft(roomId, READER)).toBe(PER_DAY);
  });

  test("deleting the trip takes its booklet down", async () => {
    // an owner of their own: each publish counts against the day's budget
    const DELETER = "deleter@example.com";
    const roomId = await roomWithPlan(DELETER);
    const { publication } = (await (
      await post(`/api/rooms/${roomId}/publish`, DELETER, { lang: "ja" })
    ).json()) as { publication: { url: string } };
    expect((await post(`/api/rooms/${roomId}/delete`, DELETER)).status).toBe(200);
    expect((await page(publication.url)).status).toBe(404);
  });
});
