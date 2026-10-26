import { describe, expect, test } from "vite-plus/test";

import {
  asked,
  budgetLeft,
  connect,
  createRoom,
  memo,
  PER_DAY,
  post,
  refusal,
  roomStorage,
  stub,
  TRIP,
  useWorker,
} from "./harness";

useWorker();

describe("the agent's draft of a day", () => {
  const DAY = TRIP.days[0]!;
  const onDay = (id: string, title: string) => ({
    ...memo(id, title),
    schedule: { date: DAY, time: null, status: "idea" },
  });
  /** Claude's tool call, as the API answers it */
  const proposing = (input: unknown) => ({
    status: 200,
    body: {
      content: [{ type: "tool_use", id: "t1", name: "propose_day", input }],
      usage: { input_tokens: 120, output_tokens: 40 },
    },
  });

  /** A room of `email`'s with two memos on the first day */
  async function roomWithDay(email: string) {
    const { roomId } = await createRoom(email);
    const a = await connect(roomId, email);
    a.send({ type: "note:add", note: onDay("lunch", "Din Tai Fung"), cid: "c1" });
    expect((await a.next()).type).toBe("ack");
    a.send({ type: "note:add", note: onDay("night", "Raohe night market"), cid: "c2" });
    expect((await a.next()).type).toBe("ack");
    a.ws.close(1000, "done");
    return roomId;
  }
  const draft = (roomId: string, email: string, date = DAY) =>
    post(`/api/rooms/${roomId}/draft`, email, { date });

  test("Claude orders the day's notes; the draft is the agent's, and the call is on the ledger", async () => {
    const roomId = await roomWithDay("drafter@example.com");
    stub.answer = () =>
      proposing({
        reason: "Lunch first, the market after dark.",
        intro: "Dumplings, then the night market.",
        items: [
          { id: "lunch", time: "12:30", minutes: 60 },
          { id: "night", time: "19:00", minutes: 1.5 },
          { id: "not-on-this-day", time: "09:00", minutes: 30 },
          { id: "lunch", time: "13:00", minutes: 45 },
        ],
      });
    const before = asked.length;
    const res = await draft(roomId, "drafter@example.com");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      by: "agent:claude",
      reason: "Lunch first, the market after dark.",
      intro: "Dumplings, then the night market.",
      // minutes that are not whole are none
      items: [
        { id: "lunch", time: "12:30", minutes: 60 },
        { id: "night", time: "19:00", minutes: null },
      ],
    });
    expect(asked.length).toBe(before + 1);
    // the prompt carries the day's notes and nothing of other days
    const prompt = (asked.at(-1) as { messages: { content: string }[] }).messages[0]!.content;
    expect(prompt).toContain("Raohe night market");

    const room = await roomStorage(roomId);
    expect(await room.exec("SELECT what, input_tokens, output_tokens FROM agent_calls")).toEqual([
      { what: "draft", input_tokens: 120, output_tokens: 40 },
    ]);
  });

  test("a day the trip does not have, or no date, is refused before anything is called", async () => {
    const roomId = await roomWithDay("nodate@example.com");
    const before = asked.length;
    expect((await draft(roomId, "nodate@example.com", "2030-01-01")).status).toBe(400);
    expect((await post(`/api/rooms/${roomId}/draft`, "nodate@example.com", {})).status).toBe(400);
    expect(asked.length).toBe(before);
  });

  test("someone outside the room cannot ask, and nothing is called", async () => {
    const roomId = await roomWithDay("owner@example.com");
    const before = asked.length;
    expect((await draft(roomId, "outsider@example.com")).status).toBe(403);
    expect(asked.length).toBe(before);
  });

  test("past the day's budget nothing is called; a provider error is refunded", async () => {
    const email = "budget@example.com";
    const roomId = await roomWithDay(email);
    // an error from Claude costs nothing: these do not count
    stub.answer = () => ({ status: 529, body: { type: "error" } });
    for (let i = 0; i < PER_DAY + 1; i++) expect((await draft(roomId, email)).status).toBe(502);

    stub.answer = () => proposing({ reason: "r", intro: "i", items: [] });
    for (let i = 0; i < PER_DAY; i++) expect((await draft(roomId, email)).status).toBe(200);
    const before = asked.length;
    const over = await draft(roomId, email);
    expect(await refusal(over)).toEqual([429, { error: "over", ceiling: "day" }]);
    expect(asked.length).toBe(before);
  });

  test("an answer that is not a draft is a failure, and it was spent", async () => {
    const email = "garbled@example.com";
    const roomId = await roomWithDay(email);
    stub.answer = () => ({ status: 200, body: { content: [{ type: "text", text: "Sure!" }] } });
    expect((await draft(roomId, email)).status).toBe(502);
    expect(await budgetLeft(roomId, email)).toBe(PER_DAY - 1);
  });
});

describe("the agent's suggestions", () => {
  const suggesting = (titles: string[]) => ({
    status: 200,
    body: {
      content: [
        {
          type: "tool_use",
          id: "t1",
          name: "suggest_notes",
          input: { suggestions: titles.map((title) => ({ title })) },
        },
      ],
      usage: { input_tokens: 90, output_tokens: 30 },
    },
  });
  const suggest = (roomId: string, email: string, body: unknown = { at: { x: 400, y: 300 } }) =>
    post(`/api/rooms/${roomId}/suggest`, email, body);

  test("ideas land as the agent's cards where the asker looks, on every socket", async () => {
    const email = "ideas@example.com";
    const { roomId } = await createRoom(email);
    const a = await connect(roomId, email);
    a.send({ type: "note:add", note: memo("n1", "Din Tai Fung"), cid: "c1" });
    expect((await a.next()).type).toBe("ack");
    stub.answer = () =>
      suggesting([
        "Elephant Mountain at sunset",
        "din tai fung",
        "Beitou hot springs",
        "Jiufen",
        "Yehliu",
      ]);

    const res = await suggest(roomId, email);
    expect(res.status).toBe(200);
    // the one the notes have is left out, and no more than three
    expect(await res.json()).toEqual({ added: 3 });
    const prompt = (asked.at(-1) as { messages: { content: string }[] }).messages[0]!.content;
    expect(prompt).toContain("Din Tai Fung");

    // the asker's own socket gets them too: nobody made them on their device
    const got = [await a.next(), await a.next(), await a.next()];
    expect(got.map((m) => m.type)).toEqual(["mutation", "mutation", "mutation"]);
    for (const m of got) {
      if (m.type !== "mutation" || m.mutation.type !== "note:add") throw new Error("not an add");
      expect(m.by).toBe("agent:claude");
      expect(m.mutation.note).toMatchObject({ kind: "suggestion", by: "agent:claude" });
      expect(Math.abs(m.mutation.note.x - 318)).toBeLessThanOrEqual(12);
    }
    expect(
      got.map((m) =>
        m.type === "mutation" &&
        m.mutation.type === "note:add" &&
        m.mutation.note.kind === "suggestion"
          ? m.mutation.note.title
          : "",
      ),
    ).toEqual(["Elephant Mountain at sunset", "Beitou hot springs", "Jiufen"]);

    // kept by the room: whoever opens it next finds them
    const b = await connect(roomId, email);
    const notes = b.snapshot.type === "snapshot" ? b.snapshot.notes : [];
    expect(notes.filter((n) => n.kind === "suggestion" && n.by === "agent:claude")).toHaveLength(3);
    // the agent's calls have no route to read them by: the ledger is its table
    const room = await roomStorage(roomId);
    expect(await room.exec("SELECT what FROM agent_calls")).toEqual([{ what: "suggest" }]);
    for (const s of [a, b]) s.ws.close(1000, "done");
  });

  test("ideas asked for at the desk's edge land on it", async () => {
    const email = "edge-ideas@example.com";
    const { roomId } = await createRoom(email);
    const a = await connect(roomId, email);
    stub.answer = () => suggesting(["Jiufen", "Yehliu", "Beitou hot springs"]);
    const res = await suggest(roomId, email, { at: { x: -1_000_000, y: 1_000_000 } });
    expect(await res.json()).toEqual({ added: 3 });
    for (let i = 0; i < 3; i++) {
      const m = await a.next();
      if (m.type !== "mutation" || m.mutation.type !== "note:add") throw new Error("not an add");
      expect(Math.abs(m.mutation.note.x)).toBeLessThanOrEqual(1_000_000);
      expect(Math.abs(m.mutation.note.y)).toBeLessThanOrEqual(1_000_000);
    }
    a.ws.close(1000, "done");
  });

  test("without where to put them, nothing is called", async () => {
    const email = "nowhere@example.com";
    const { roomId } = await createRoom(email);
    const before = asked.length;
    expect((await suggest(roomId, email, {})).status).toBe(400);
    expect((await suggest(roomId, email, { at: { x: "a", y: 1 } })).status).toBe(400);
    expect(asked.length).toBe(before);
  });

  test("the asker's words and the note they asked from reach the agent", async () => {
    const email = "askwords@example.com";
    const { roomId } = await createRoom(email);
    const a = await connect(roomId, email);
    a.send({ type: "note:add", note: memo("n1", "Raohe night market"), cid: "c1" });
    expect((await a.next()).type).toBe("ack");
    a.ws.close(1000, "done");
    stub.answer = () => suggesting(["Shilin night market"]);

    const words = `  something sweet ${"x".repeat(200)}`;
    const res = await suggest(roomId, email, { at: { x: 400, y: 300 }, ask: words, about: "n1" });
    expect(res.status).toBe(200);
    const prompt = (asked.at(-1) as { messages: { content: string }[] }).messages[0]!.content;
    // trimmed, and no longer than a line
    expect(prompt).toContain(JSON.stringify(words.trim().slice(0, 100)));
    expect(prompt).not.toContain("x".repeat(101));
    expect(prompt).toContain('"title":"Raohe night market"');
    expect(prompt).toContain("They are asking from this note");
  });

  test("blank words and no note ask for anything", async () => {
    const email = "askblank@example.com";
    const { roomId } = await createRoom(email);
    stub.answer = () => suggesting([]);
    const res = await suggest(roomId, email, { at: { x: 0, y: 0 }, ask: "   " });
    expect(res.status).toBe(200);
    const prompt = (asked.at(-1) as { messages: { content: string }[] }).messages[0]!.content;
    expect(prompt).not.toContain("What they asked for");
    expect(prompt).not.toContain("They are asking from this note");
  });

  test("from a note no longer on the desk, nothing is called", async () => {
    const email = "askgone@example.com";
    const { roomId } = await createRoom(email);
    const before = asked.length;
    const res = await suggest(roomId, email, { at: { x: 0, y: 0 }, about: "gone" });
    expect(res.status).toBe(404);
    expect(asked.length).toBe(before);
  });

  test("a provider error writes nothing and costs nothing", async () => {
    const email = "ideasdown@example.com";
    const { roomId } = await createRoom(email);
    stub.answer = () => ({ status: 500, body: { type: "error" } });
    expect((await suggest(roomId, email)).status).toBe(502);
    const a = await connect(roomId, email);
    expect(a.snapshot).toMatchObject({ notes: [] });
    a.ws.close(1000, "done");
    expect(await budgetLeft(roomId, email)).toBe(PER_DAY);
  });
});

describe("what Claude is sent, and what it answers", () => {
  const prompt = () => (asked.at(-1) as { messages: { content: string }[] }).messages[0]!.content;

  test("a day of long memos sends the latest that fit, not every word", async () => {
    const email = "longday@example.com";
    const { roomId } = await createRoom(email);
    const a = await connect(roomId, email);
    const schedule = { date: TRIP.days[0], time: null, status: "idea" };
    for (let i = 0; i < 12; i++) {
      a.send({
        type: "note:add",
        note: { ...memo(`m${i}`, `memo number ${i}`), body: "w".repeat(4000), schedule },
        cid: `c${i}`,
      });
      expect((await a.next()).type).toBe("ack");
    }
    a.ws.close(1000, "done");
    stub.answer = () => ({
      status: 200,
      body: {
        content: [
          {
            type: "tool_use",
            id: "t1",
            name: "propose_day",
            input: { reason: "r", intro: "i", items: [] },
          },
        ],
        usage: { input_tokens: 1, output_tokens: 1 },
      },
    });
    expect((await post(`/api/rooms/${roomId}/draft`, email, { date: TRIP.days[0] })).status).toBe(
      200,
    );
    expect(prompt().length).toBeLessThan(32_000);
    expect(prompt()).toContain("memo number 11");
    expect(prompt()).not.toContain("memo number 0");
  });

  test("a memo's tags go to Claude as tags: at most twenty, none longer than one", async () => {
    const email = "longtags@example.com";
    const { roomId } = await createRoom(email);
    stub.answer = () => ({
      status: 200,
      body: {
        content: [{ type: "tool_use", id: "t1", name: "name_place", input: { queries: [] } }],
        usage: { input_tokens: 1, output_tokens: 1 },
      },
    });
    const tags = ["t".repeat(41), ...Array.from({ length: 25 }, (_, i) => `tag${i}`)];
    expect(
      (await post(`/api/rooms/${roomId}/places`, email, { title: "x", tags, lang: "en" })).status,
    ).toBe(200);
    const memoSent = JSON.parse(prompt().split("\n")[2]!) as { tags: string[] };
    expect(memoSent.tags).toEqual(Array.from({ length: 19 }, (_, i) => `tag${i}`));
  });

  test("a 2xx that is no JSON is a failure, and it was spent", async () => {
    const email = "nojson@example.com";
    const { roomId } = await createRoom(email);
    stub.answer = () => ({ status: 200, body: new TextEncoder().encode("{not json") });
    expect((await post(`/api/rooms/${roomId}/suggest`, email, { at: { x: 0, y: 0 } })).status).toBe(
      502,
    );
    expect(await budgetLeft(roomId, email)).toBe(PER_DAY - 1);
  });
});
