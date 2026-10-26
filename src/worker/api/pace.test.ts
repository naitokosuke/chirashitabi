import { describe, expect, test } from "vite-plus/test";

import {
  asked,
  budgetLeft,
  createRoom,
  looked,
  PER_DAY,
  post,
  server,
  stub,
  useWorker,
} from "./harness";

/**
 * The geocoder's pace, shortened as production's is in proportion (1100ms apart, 5000ms ahead):
 * long enough that lookups sent at once all reach the index before the first turn has passed
 */
const SPACING = 500;
const QUEUE = 2250;

/**
 * Each test has a Worker of its own, so it starts from an empty queue: the turns are kept in the
 * index's memory, and no test waits for the one before to run out
 */
const paced = () =>
  useWorker({ GEOCODER_SPACING_MS: String(SPACING), GEOCODER_QUEUE_MS: String(QUEUE) });

/** Claude naming one place, as the API answers it */
const namingOne = () => ({
  status: 200,
  body: {
    content: [{ type: "tool_use", id: "t1", name: "name_place", input: { queries: ["x"] } }],
    usage: { input_tokens: 40, output_tokens: 12 },
  },
});

const lookUp = (roomId: string, email: string) =>
  post(`/api/rooms/${roomId}/find`, email, { query: "Taipei 101", lang: "en" });

describe("the geocoder's pace: one request at a time", () => {
  paced();

  test("one request a turn for the whole app; one that would wait too long is not sent", async () => {
    const email = "pace@example.com";
    const { roomId } = await createRoom(email);
    const started = Date.now();
    const [one, two] = await Promise.all([lookUp(roomId, email), lookUp(roomId, email)]);
    expect([one.status, two.status]).toEqual([200, 200]);
    // the second waited its turn (a margin under it for the clocks of two processes)
    expect(Date.now() - started).toBeGreaterThanOrEqual(SPACING * 0.9);
    // seven at once: the turns past the queue's end, or past the asker's share, are refused,
    // not queued
    const statuses = (
      await Promise.all(Array.from({ length: 7 }, () => lookUp(roomId, email)))
    ).map((r) => r.status);
    expect(statuses).toContain(200);
    expect(statuses).toContain(502);
  }, 15_000);
});

describe("the geocoder's pace: a share each", () => {
  paced();

  test("one person's lookups hold a share of the turns, never all of them", async () => {
    const greedy = "pace-greedy@example.com";
    const other = "pace-other@example.com";
    const [{ roomId: mine }, { roomId: theirs }] = [
      await createRoom(greedy),
      await createRoom(other),
    ];
    // six at once from one person: the turns they hold run out before the queue does
    const flood = Array.from({ length: 6 }, () => lookUp(mine, greedy));
    // once one is refused they hold their share, and the rest of the six are refused too
    await Promise.any(
      flood.map(async (res) => {
        if ((await res).status !== 502) throw new Error("not refused");
      }),
    );
    // and someone else, asking meanwhile, still has a turn
    expect((await lookUp(theirs, other)).status).toBe(200);
    const statuses = (await Promise.all(flood)).map((r) => r.status);
    expect(statuses.filter((s) => s === 200)).toHaveLength(3);
    expect(statuses.filter((s) => s === 502)).toHaveLength(3);
  }, 15_000);
});

describe("the geocoder's pace: a place with no turn", () => {
  paced();

  test("a place Claude named that the geocoder had no turn for is spent: Claude was paid", async () => {
    const email = "pace-places@example.com";
    const { roomId } = await createRoom(email);
    stub.answer = namingOne;
    const index = (await server.getWorker().getEnv()).ROOMS.getByName("index");
    // the queue taken to its end, as many people asking at once would
    let taken = 0;
    while ((await index.geocoderTurn(`pace-crowd-${taken}@example.com`)) !== null) taken++;
    expect(taken).toBeGreaterThan(0);
    expect(
      (await post(`/api/rooms/${roomId}/places`, email, { title: "寧夏夜市", body: "" })).status,
    ).toBe(502);
    expect(asked).toHaveLength(1);
    expect(looked).toEqual([]);
    expect(await budgetLeft(roomId, email)).toBe(PER_DAY - 1);
  }, 15_000);
});

describe("the geocoder's pace: places asked all at once", () => {
  paced();

  test("places asked all at once pay Claude no more than the budget, and hold only their share of the turns", async () => {
    const flood = "pace-flood@example.com";
    const other = "pace-flood-other@example.com";
    const [{ roomId: mine }, { roomId: theirs }] = [
      await createRoom(flood),
      await createRoom(other),
    ];
    stub.answer = namingOne;
    const places = () => post(`/api/rooms/${mine}/places`, flood, { title: "寧夏夜市", body: "" });

    // their lookups already hold their share of the turns to come, behind someone else's
    const index = (await server.getWorker().getEnv()).ROOMS.getByName("index");
    expect(await index.geocoderTurn("pace-flood-ahead@example.com")).not.toBeNull();
    for (let i = 0; i < 2; i++) expect(await index.geocoderTurn(flood)).not.toBeNull();
    // a place asked meanwhile has no turn: Claude was paid for it, and it is spent
    expect((await places()).status).toBe(502);
    expect(asked).toHaveLength(1);
    // and someone else still has one
    expect((await lookUp(theirs, other)).status).toBe(200);

    // however many are asked at once, Claude is asked only as often as the budget allows
    const statuses = (await Promise.all(Array.from({ length: 6 }, places))).map((r) => r.status);
    expect(asked).toHaveLength(PER_DAY);
    expect(statuses.filter((s) => s === 429)).toHaveLength(6 - (PER_DAY - 1));
    // every call Claude was paid for is spent: none is left
    expect(await budgetLeft(mine, flood)).toBe(0);
  }, 15_000);
});
