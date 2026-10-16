import type { Brand } from "./brand";

// Values both sides name, apart from wire.ts so the app can take them without the checks (and
// the airports list the checks load)

/** How many people a room holds; an invitation holds a seat until it is answered */
export const SEATS = 2;

export const COLORS = ["#fff1b8", "#ffd9de", "#d8f0e6", "#dbe7ff", "#ead9ff", "#ffffff"] as const;
/** A card's paper: one of the palette, never a free CSS value */
export type NoteColor = (typeof COLORS)[number];

export type NoteStatus = "idea" | "fixed" | "done";

/** A tag on a memo, as the room keeps it: at most 40 characters, never empty */
export type Tag = Brand<string, "Tag">;

/** The tag, or null when the room would not keep it */
export const tagOf = (v: unknown): Tag | null =>
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the brand is minted here
  typeof v === "string" && v !== "" && v.length <= 40 ? (v as Tag) : null;
