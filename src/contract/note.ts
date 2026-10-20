import * as v from "valibot";

export const NoteIdSchema = v.pipe(v.string(), v.nanoid(), v.maxLength(64), v.brand("NoteId"));

export type NoteId = v.InferOutput<typeof NoteIdSchema>;

/** A note's id, as the device that made the note minted it (uid in useNotes.ts) */
export const isNoteId = (value: unknown): value is NoteId =>
  v.safeParse(NoteIdSchema, value).success;

if (import.meta.vitest !== undefined) {
  const { describe, expect, test } = import.meta.vitest;

  describe("isNoteId", () => {
    test("up to 64 of letters, digits, _ and -", () => {
      expect(isNoteId("a_B-3")).toBe(true);
      expect(isNoteId("x".repeat(64))).toBe(true);
    });
    test("nothing else", () => {
      expect(isNoteId("")).toBe(false);
      expect(isNoteId("x".repeat(65))).toBe(false);
      expect(isNoteId("a.b")).toBe(false);
    });
  });
}
