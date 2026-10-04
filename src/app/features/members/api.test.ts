import { describe, expect, test } from "vite-plus/test";

import { invitedOf } from "./api";

describe("invitedOf", () => {
  test("reads the e-mails the owner invited", () => {
    expect(invitedOf({ invited: ["a@example.com"] })).toEqual(["a@example.com"]);
  });

  test("what is not sound is left out, never guessed", () => {
    expect(invitedOf(null)).toEqual([]);
    expect(invitedOf({ invited: "a@example.com" })).toEqual([]);
    expect(invitedOf({ invited: [1, "b@example.com"] })).toEqual(["b@example.com"]);
  });
});
