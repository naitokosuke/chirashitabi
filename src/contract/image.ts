import * as v from "valibot";

import { UuidSchema } from "../shared/uuid";

export const ImageIdSchema = v.pipe(UuidSchema, v.brand("ImageId"));

/** A picture kept by the room (its bytes in R2), as the room minted its id */
export type ImageId = v.InferOutput<typeof ImageIdSchema>;

/** An image's id, as the room mints it (a UUID) */
export const isImageId = (value: unknown): value is ImageId =>
  v.safeParse(ImageIdSchema, value).success;

if (import.meta.vitest !== undefined) {
  const { describe, expect, test } = import.meta.vitest;

  describe("isImageId", () => {
    test("a UUID only", () => {
      expect(isImageId("0f8fad5b-d9cb-469f-a165-70867728950e")).toBe(true);
      expect(isImageId("agent:claude")).toBe(false);
    });
  });
}
