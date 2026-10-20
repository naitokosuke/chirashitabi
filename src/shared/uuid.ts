import * as v from "valibot";

/**
 * A UUID as `crypto.randomUUID()` writes it: lowercase, with its hyphens. Valibot's `uuid` takes
 * either case, but the same id in capitals would name another Durable Object or R2 key
 */
export const UuidSchema = v.pipe(
  v.string(),
  v.uuid(),
  v.check((s) => s === s.toLowerCase()),
);

if (import.meta.vitest !== undefined) {
  const { expect, test } = import.meta.vitest;

  test("lowercase, hyphens and all", () => {
    expect(v.is(UuidSchema, "0f8fad5b-d9cb-469f-a165-70867728950e")).toBe(true);
    expect(v.is(UuidSchema, "0F8FAD5B-D9CB-469F-A165-70867728950E")).toBe(false);
    expect(v.is(UuidSchema, "0F8fad5b-d9cb-469f-a165-70867728950e")).toBe(false);
    expect(v.is(UuidSchema, "0f8fad5bd9cb469fa16570867728950e")).toBe(false);
  });
}
