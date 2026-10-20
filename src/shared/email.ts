import * as v from "valibot";

// The schema trims and lowercases, so its output is not what was given: a parse, never a
// `value is` guard

export const EmailSchema = v.pipe(
  v.string(),
  v.maxLength(254),
  v.trim(),
  v.regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/),
  v.toLowerCase(),
  v.brand("Email"),
);

/** An e-mail address, trimmed and lowercased, so one address is one value however it was typed */
export type Email = v.InferOutput<typeof EmailSchema>;

/** The address, or null when it is not shaped like one; whether it reaches anyone is not checked */
export const parseEmail = (value: unknown): Email | null => {
  const result = v.safeParse(EmailSchema, value);
  return result.success ? result.output : null;
};

if (import.meta.vitest !== undefined) {
  const { describe, expect, test } = import.meta.vitest;

  describe("parseEmail", () => {
    test("trimmed and lowercased", () =>
      expect(parseEmail("  Pat@Example.COM ")).toBe("pat@example.com"));
    test("the length counts what was given, spaces and all", () => {
      const local = "a".repeat(240);
      expect(parseEmail(`${local}@example.com`)).not.toBeNull();
      expect(parseEmail(`${" ".repeat(10)}${local}@example.com`)).toBeNull();
    });
    test("not an address", () => {
      expect(parseEmail("pat@example")).toBeNull();
      expect(parseEmail("pat @example.com")).toBeNull();
      expect(parseEmail(undefined)).toBeNull();
    });
  });
}
