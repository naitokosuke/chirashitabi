import * as v from "valibot";

import { parserOf } from "../shared/parse";
import { UuidSchema } from "../shared/uuid";

// Values both sides name, apart from wire.ts so the app can take them without the checks (and
// the airports list the checks load)

export const RoomIdSchema = v.pipe(UuidSchema, v.brand("RoomId"));

/** A room's id, as the Worker mints it: a UUID */
export type RoomId = v.InferOutput<typeof RoomIdSchema>;

/** The id, or null when it is not one the Worker could have made */
export const parseRoomId = parserOf(RoomIdSchema);

/** How many people a room holds; an invitation holds a seat until it is answered */
export const SEATS = 2;

/** How many days a deleted room can be restored before it is gone for good */
export const KEPT_DAYS = 30;

export const COLORS = ["#fff1b8", "#ffd9de", "#d8f0e6", "#dbe7ff", "#ead9ff", "#ffffff"] as const;
/** A card's paper: one of the palette, never a free CSS value */
export type NoteColor = (typeof COLORS)[number];

export const STATUSES = ["idea", "fixed", "done"] as const;
export type NoteStatus = (typeof STATUSES)[number];

/** A tag on a memo, as the room keeps it: at most 40 characters, never empty */
export const TagSchema = v.pipe(v.string(), v.nonEmpty(), v.maxLength(40), v.brand("Tag"));

export type Tag = v.InferOutput<typeof TagSchema>;

/** The tag, or null when the room would not keep it */
export const parseTag = parserOf(TagSchema);

if (import.meta.vitest !== undefined) {
  const { describe, expect, test } = import.meta.vitest;

  const uuid = "0f8fad5b-d9cb-469f-a165-70867728950e";

  describe("parseRoomId", () => {
    test("a UUID, as it is", () => expect(parseRoomId(uuid)).toBe(uuid));
    test("not one the Worker could have made", () => {
      expect(parseRoomId(uuid.toUpperCase())).toBeNull();
      expect(parseRoomId(`${uuid} `)).toBeNull();
      expect(parseRoomId(42)).toBeNull();
    });
  });
}
