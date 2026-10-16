import * as v from "valibot";

// Values both sides name, apart from wire.ts so the app can take them without the checks (and
// the airports list the checks load)

/** How many people a room holds; an invitation holds a seat until it is answered */
export const SEATS = 2;

export const COLORS = ["#fff1b8", "#ffd9de", "#d8f0e6", "#dbe7ff", "#ead9ff", "#ffffff"] as const;
/** A card's paper: one of the palette, never a free CSS value */
export type NoteColor = (typeof COLORS)[number];

export const STATUSES = ["idea", "fixed", "done"] as const;
export type NoteStatus = (typeof STATUSES)[number];

/** A tag on a memo, as the room keeps it: at most 40 characters, never empty */
export const TagSchema = v.pipe(v.string(), v.nonEmpty(), v.maxLength(40), v.brand("Tag"));

export type Tag = v.InferOutput<typeof TagSchema>;

/** The tag, or null when the room would not keep it */
export const tagOf = (value: unknown): Tag | null => {
  const result = v.safeParse(TagSchema, value);
  return result.success ? result.output : null;
};
