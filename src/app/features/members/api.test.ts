import { describe, expect, test } from "vite-plus/test";

import { peopleOf } from "./api";

describe("peopleOf", () => {
  test("reads who owns the room, whom they invited, and how many it holds", () => {
    expect(peopleOf({ owner: "m1", invited: ["a@example.com"], seats: 2 })).toEqual({
      owner: "m1",
      invited: ["a@example.com"],
      seats: 2,
    });
  });

  test("what is not sound is left empty, never guessed", () => {
    expect(peopleOf(null)).toEqual({ owner: null, invited: [], seats: 0 });
    expect(peopleOf({ owner: "", invited: [1, "b@example.com"], seats: 1.5 })).toEqual({
      owner: null,
      invited: ["b@example.com"],
      seats: 0,
    });
  });
});
