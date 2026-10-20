import * as v from "valibot";

import { parserOf } from "../shared/parse";
import { UuidSchema } from "../shared/uuid";

export const MemberIdSchema = v.pipe(
  v.union([UuidSchema, v.pipe(v.string(), v.regex(/^agent:[a-z]+$/))]),
  v.brand("MemberId"),
);

export type MemberId = v.InferOutput<typeof MemberIdSchema>;

/** A member's id, as a room mints it: a UUID for a person, `agent:<name>` for its agent; or null */
export const parseMemberId = parserOf(MemberIdSchema);

if (import.meta.vitest !== undefined) {
  const { describe, expect, test } = import.meta.vitest;

  describe("parseMemberId", () => {
    test("a person's UUID or the agent's name", () => {
      const id = "0f8fad5b-d9cb-469f-a165-70867728950e";
      expect(parseMemberId(id)).toBe(id);
      expect(parseMemberId("agent:claude")).toBe("agent:claude");
    });
    test("nothing else", () => {
      expect(parseMemberId("agent:")).toBeNull();
      expect(parseMemberId("agent:Claude")).toBeNull();
      expect(parseMemberId(null)).toBeNull();
    });
  });
}
