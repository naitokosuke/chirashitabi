import * as v from "valibot";

/** A UUID as `crypto.randomUUID()` writes it: lowercase, with its hyphens */
export const UuidSchema = v.pipe(
  v.string(),
  v.regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/),
);

if (import.meta.vitest !== undefined) {
  const { expect, test } = import.meta.vitest;

  test("lowercase, hyphens and all", () => {
    expect(v.is(UuidSchema, "0f8fad5b-d9cb-469f-a165-70867728950e")).toBe(true);
    expect(v.is(UuidSchema, "0F8FAD5B-D9CB-469F-A165-70867728950E")).toBe(false);
    expect(v.is(UuidSchema, "0f8fad5bd9cb469fa16570867728950e")).toBe(false);
  });
}
