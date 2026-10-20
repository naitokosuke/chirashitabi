import * as v from "valibot";

import { UuidSchema } from "../shared/uuid";

export const ImageIdSchema = v.pipe(UuidSchema, v.brand("ImageId"));

/** A picture kept by the room (its bytes in R2), as the room minted its id */
export type ImageId = v.InferOutput<typeof ImageIdSchema>;

/** An image's id, as the room mints it (a UUID), or null */
export const parseImageId = (value: unknown): ImageId | null => {
  const result = v.safeParse(ImageIdSchema, value);
  return result.success ? result.output : null;
};

if (import.meta.vitest !== undefined) {
  const { describe, expect, test } = import.meta.vitest;

  describe("parseImageId", () => {
    test("a UUID only", () => {
      const id = "0f8fad5b-d9cb-469f-a165-70867728950e";
      expect(parseImageId(id)).toBe(id);
      expect(parseImageId("agent:claude")).toBeNull();
    });
  });
}
