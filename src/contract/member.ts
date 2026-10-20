import * as v from "valibot";

import { UuidSchema } from "../shared/uuid";

export const MemberIdSchema = v.pipe(
  v.union([UuidSchema, v.pipe(v.string(), v.regex(/^agent:[a-z]+$/))]),
  v.brand("MemberId"),
);

export type MemberId = v.InferOutput<typeof MemberIdSchema>;

/** A member's id, as a room mints it: a UUID for a person, `agent:<name>` for its agent */
export const isMemberId = (value: unknown): value is MemberId =>
  v.safeParse(MemberIdSchema, value).success;

if (import.meta.vitest !== undefined) {
  const { describe, expect, test } = import.meta.vitest;

  describe("isMemberId", () => {
    test("a person's UUID or the agent's name", () => {
      expect(isMemberId("0f8fad5b-d9cb-469f-a165-70867728950e")).toBe(true);
      expect(isMemberId("agent:claude")).toBe(true);
    });
    test("nothing else", () => {
      expect(isMemberId("agent:")).toBe(false);
      expect(isMemberId("agent:Claude")).toBe(false);
      expect(isMemberId(null)).toBe(false);
    });
  });
}
