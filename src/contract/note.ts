import * as v from "valibot";

import { parserOf } from "../shared/parse";

export const NoteIdSchema = v.pipe(v.string(), v.nanoid(), v.maxLength(64), v.brand("NoteId"));

export type NoteId = v.InferOutput<typeof NoteIdSchema>;

/** A note's id, as the device that made the note minted it (uid in useNotes.ts), or null */
export const parseNoteId = parserOf(NoteIdSchema);

if (import.meta.vitest !== undefined) {
  const { describe, expect, test } = import.meta.vitest;

  describe("parseNoteId", () => {
    test("up to 64 of letters, digits, _ and -", () => {
      expect(parseNoteId("a_B-3")).toBe("a_B-3");
      expect(parseNoteId("x".repeat(64))).toBe("x".repeat(64));
    });
    test("nothing else", () => {
      expect(parseNoteId("")).toBeNull();
      expect(parseNoteId("x".repeat(65))).toBeNull();
      expect(parseNoteId("a.b")).toBeNull();
    });
  });
}
