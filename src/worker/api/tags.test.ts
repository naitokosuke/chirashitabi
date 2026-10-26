import { describe, expect, test } from "vite-plus/test";

import {
  APP,
  asked,
  budgetLeft,
  connect,
  createRoom,
  judged,
  memo,
  PER_DAY,
  post,
  roomStorage,
  server,
  stub,
  token,
  useWorker,
} from "./harness";

useWorker();

describe("tags suggested for a memo", () => {
  const proposingTags = (tags: string[]) => ({
    status: 200,
    body: {
      content: [{ type: "tool_use", id: "t1", name: "propose_tags", input: { tags } }],
      usage: { input_tokens: 50, output_tokens: 20 },
    },
  });
  /** Clef's answer: the probability per question id, from a tag -> p map */
  const judging =
    (p: Record<string, number>) => (input: { questions: Record<string, unknown> }) => ({
      status: 200,
      body: {
        model: "clef-flash",
        answers: Object.fromEntries(
          Object.entries(input.questions).map(([id, q]) => {
            const tag = /"#(.+)"\?$/.exec((q as { instructions: string }).instructions)?.[1] ?? "";
            return [id, { type: "noul", noul: p[tag] ?? 0.1 }];
          }),
        ),
      },
    });
  const ask = (roomId: string, email: string, body: unknown) =>
    post(`/api/rooms/${roomId}/tags`, email, body);

  test("Claude proposes the trip's candidates once; Clef judges each, in use or new", async () => {
    const email = "tagger@example.com";
    const { roomId } = await createRoom(email);
    const a = await connect(roomId, email);
    a.send({ type: "note:add", note: memo("n1", "Din Tai Fung"), cid: "c1" }); // tagged #Food
    expect((await a.next()).type).toBe("ack");
    a.ws.close(1000, "done");

    stub.answer = () => proposingTags(["#Night markets", "Food", "Hot springs", "   "]);
    stub.judge = judging({ Food: 0.4, "Night markets": 0.93, "Hot springs": 0.62 });
    const calls = asked.length;
    const res = await ask(roomId, email, {
      title: "Raohe night market",
      body: "pepper buns",
      image: null,
      chosen: [],
    });
    expect(res.status).toBe(200);
    // every tag with how likely it fits, the unlikely too: the form ranks by it
    expect(await res.json()).toEqual({
      tags: [
        { tag: "Night markets", p: 0.93, isNew: true },
        { tag: "Hot springs", p: 0.62, isNew: true },
        { tag: "Food", p: 0.4, isNew: false },
      ],
    });
    expect(asked.length).toBe(calls + 1);
    // the tag in use and the new candidates ("Food" was in use already, the blank one dropped)
    const questions = Object.values(judged.at(-1)!.questions).map(
      (q) => (q as { instructions: string }).instructions,
    );
    expect(questions).toEqual([
      'Does this travel note belong under the tag "#Food"?',
      'Does this travel note belong under the tag "#Night markets"?',
      'Does this travel note belong under the tag "#Hot springs"?',
    ]);
    expect(judged.at(-1)!.state).toEqual({ title: "Raohe night market", body: "pepper buns" });

    // asked again: the candidates are kept, Claude is not called; a tag already on the memo is not asked about
    const again = await ask(roomId, email, {
      title: "x",
      body: "",
      image: null,
      chosen: ["night markets"],
    });
    expect(again.status).toBe(200);
    expect(asked.length).toBe(calls + 1);
    expect(Object.keys(judged.at(-1)!.questions)).toHaveLength(2);
  });

  test("a room of many long tags and titles sends the latest that fit, not every word", async () => {
    const email = "tagsmany@example.com";
    const { roomId } = await createRoom(email);
    const a = await connect(roomId, email);
    // 160 memos, each with a title of 200 characters and 20 tags of 40 of its own
    const pad = (s: string, n: number) => s.padEnd(n, "x");
    for (let i = 0; i < 160; i++) {
      const tags = Array.from({ length: 20 }, (_, t) => pad(`tag ${i}-${t} `, 40));
      a.send({
        type: "note:add",
        note: { ...memo(`m${i}`, pad(`title ${i} `, 200)), tags },
        cid: `c${i}`,
      });
      expect((await a.next()).type).toBe("ack");
    }
    a.ws.close(1000, "done");
    stub.answer = () => proposingTags(["Tea"]);
    stub.judge = judging({});
    expect((await ask(roomId, email, { title: "x", body: "", image: null })).status).toBe(200);
    const prompt = (asked.at(-1) as { messages: { content: string }[] }).messages[0]!.content;
    expect(prompt.length).toBeLessThan(32_000);
    expect(prompt).toContain("tag 159-19 ");
    expect(prompt).not.toContain('"tag 0-0 ');
    expect(prompt).toContain("title 159 ");
    expect(prompt).not.toContain('"title 0 ');
  }, 30_000);

  test("the trip's candidates are read for free: none before the first ask, then the agent's", async () => {
    const email = "candidates@example.com";
    const { roomId } = await createRoom(email);
    const candidates = () => post(`/api/rooms/${roomId}/candidates`, email, {});
    const calls = asked.length;
    const before = await candidates();
    expect(before.status).toBe(200);
    expect(await before.json()).toEqual({ tags: [] });
    expect(asked.length).toBe(calls);

    stub.answer = () => proposingTags(["Airport", "Souvenirs"]);
    stub.judge = judging({});
    await ask(roomId, email, { title: "x", body: "", image: null, chosen: [] });
    expect(await (await candidates()).json()).toEqual({ tags: ["Airport", "Souvenirs"] });
    // the ask spent Claude's and Clef's calls; reading the candidates spent nothing
    expect(await budgetLeft(roomId, email)).toBe(PER_DAY - 2);
  });

  test("the memo's picture goes to Clef with its words", async () => {
    const email = "tagphoto@example.com";
    const { roomId } = await createRoom(email);
    const up = await server.fetch(`${APP}/api/rooms/${roomId}/images`, {
      method: "POST",
      headers: {
        "Cf-Access-Jwt-Assertion": await token(email),
        Origin: APP,
        "Content-Type": "image/webp",
      },
      body: new Uint8Array([1, 2, 3]),
    });
    const { id } = (await up.json()) as { id: string };
    stub.answer = () => proposingTags(["Views"]);
    stub.judge = judging({ Views: 0.8 });
    expect(
      (await ask(roomId, email, { title: "Elephant Mountain", body: "", image: id, chosen: [] }))
        .status,
    ).toBe(200);
    expect(judged.at(-1)!.images).toEqual([{ content_type: "image/webp", base64: "AQID" }]);
  });

  test("a Clef error costs nothing; a bad request is refused before anything is called", async () => {
    const email = "tagdown@example.com";
    const { roomId } = await createRoom(email);
    stub.answer = () => proposingTags(["Food"]);
    stub.judge = () => ({ status: 503, body: {} });
    expect((await ask(roomId, email, { title: "x", body: "", image: null })).status).toBe(502);
    const before = judged.length;
    expect((await ask(roomId, email, { body: "no title" })).status).toBe(400);
    expect((await ask(roomId, email, { title: "x", image: "not-an-id" })).status).toBe(400);
    expect(judged.length).toBe(before);
    // the candidates' call was spent, Clef's given back, and the bad requests spent nothing
    expect(await budgetLeft(roomId, email)).toBe(PER_DAY - 1);
  });

  test("a Clef answer that is no answer is spent: the model ran", async () => {
    const email = "tagnonsense@example.com";
    const { roomId } = await createRoom(email);
    stub.answer = () => proposingTags(["Food"]);
    // a 2xx that is no JSON, then one that is JSON but no answers
    stub.judge = () => ({ status: 200, body: new TextEncoder().encode("<html>") });
    expect((await ask(roomId, email, { title: "x", body: "", image: null })).status).toBe(502);
    stub.judge = () => ({ status: 200, body: { model: "clef-flash" } });
    expect((await ask(roomId, email, { title: "y", body: "", image: null })).status).toBe(502);
    // the candidates' call and both of Clef's
    expect(await budgetLeft(roomId, email)).toBe(PER_DAY - 3);
  });

  test("a Claude error proposing the candidates costs nothing; with no tags at all Clef is not asked", async () => {
    const email = "candidatesdown@example.com";
    const { roomId } = await createRoom(email);
    stub.answer = () => ({ status: 529, body: { type: "error" } });
    const before = judged.length;
    const res = await ask(roomId, email, { title: "x", body: "", image: null, chosen: [] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ tags: [] });
    expect(judged.length).toBe(before);
    // nothing was spent, so the next ask proposes them
    stub.answer = () => proposingTags(["Tea"]);
    stub.judge = judging({ Tea: 0.7 });
    const calls = asked.length;
    expect((await ask(roomId, email, { title: "x", body: "", image: null })).status).toBe(200);
    expect(asked.length).toBe(calls + 1);
    // the failed proposal was given back: only the second ask's two calls are spent
    expect(await budgetLeft(roomId, email)).toBe(PER_DAY - 2);
  });

  test("two asks at once pay for one proposal", async () => {
    const email = "candidatesrace@example.com";
    const { roomId } = await createRoom(email);
    stub.answer = () => proposingTags(["Tea"]);
    stub.judge = judging({ Tea: 0.7 });
    const calls = asked.length;
    const both = await Promise.all([
      ask(roomId, email, { title: "x", body: "", image: null }),
      ask(roomId, email, { title: "y", body: "", image: null }),
    ]);
    expect(both.map((r) => r.status)).toEqual([200, 200]);
    expect(asked.length).toBe(calls + 1);
  });

  test("a proposal paid for with no tag to keep was proposed all the same", async () => {
    stub.judge = judging({});
    const proposedOnce = async (email: string, first: typeof stub.answer) => {
      const { roomId } = await createRoom(email);
      const calls = asked.length;
      stub.answer = first;
      expect((await ask(roomId, email, { title: "x", body: "", image: null })).status).toBe(200);
      stub.answer = () => proposingTags(["Tea"]);
      expect((await ask(roomId, email, { title: "y", body: "", image: null })).status).toBe(200);
      expect(asked.length).toBe(calls + 1);
    };
    // tags that are none once trimmed
    await proposedOnce("candidatesnone@example.com", () => proposingTags(["   ", "#"]));
  });

  test("a failed proposal paid for is not asked again at once, nor given up for good", async () => {
    const email = "candidatesbad@example.com";
    const { roomId } = await createRoom(email);
    stub.judge = judging({ Tea: 0.7 });
    const calls = asked.length;
    // an answer that is no proposal at all: spent, and nothing kept
    stub.answer = () => ({
      status: 200,
      body: { content: [], usage: { input_tokens: 1, output_tokens: 1 } },
    });
    expect((await ask(roomId, email, { title: "x", body: "", image: null })).status).toBe(200);
    expect(asked.length).toBe(calls + 1);
    // asked again at once, the failed one is not paid for again
    stub.answer = () => proposingTags(["Tea"]);
    expect((await ask(roomId, email, { title: "y", body: "", image: null })).status).toBe(200);
    expect(asked.length).toBe(calls + 1);
    // once its claim has lapsed, the next ask proposes them, and they are kept
    const room = await roomStorage(roomId);
    await room.exec("UPDATE tag_proposal SET at = 0");
    expect((await ask(roomId, email, { title: "z", body: "", image: null })).status).toBe(200);
    expect(asked.length).toBe(calls + 2);
    expect(await (await post(`/api/rooms/${roomId}/candidates`, email)).json()).toEqual({
      tags: ["Tea"],
    });
  });
});
