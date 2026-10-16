import * as v from "valibot";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Each id's type is what its schema puts out. A guard may say `value is` that output only
// because its schema leaves the value as it is; the e-mail's trims it, so it is a parse

export const RoomIdSchema = v.pipe(v.string(), v.regex(UUID), v.brand("RoomId"));

/** A room's id, as the Worker mints it: a UUID */
export type RoomId = v.InferOutput<typeof RoomIdSchema>;

/** The id, or null when it is not one the Worker could have made */
export const roomId = (value: unknown): RoomId | null => {
  const result = v.safeParse(RoomIdSchema, value);
  return result.success ? result.output : null;
};

export const MemberIdSchema = v.pipe(
  v.string(),
  v.check((s) => UUID.test(s) || /^agent:[a-z]+$/.test(s)),
  v.brand("MemberId"),
);

export type MemberId = v.InferOutput<typeof MemberIdSchema>;

/** A member's id, as a room mints it: a UUID for a person, `agent:<name>` for its agent */
export const isMemberId = (value: unknown): value is MemberId =>
  v.safeParse(MemberIdSchema, value).success;

export const EmailSchema = v.pipe(
  v.string(),
  v.maxLength(254),
  v.trim(),
  v.regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/),
  v.toLowerCase(),
  v.brand("Email"),
);

/** An e-mail address as a person logs in with it: trimmed and lowercased, one key per person */
export type Email = v.InferOutput<typeof EmailSchema>;

/**
 * An e-mail address, to invite or as Access vouches for it, lowercased as the index keeps it,
 * or null. Only its shape is checked; whether it can log in is Access's to say.
 */
export const parseEmail = (value: unknown): Email | null => {
  const result = v.safeParse(EmailSchema, value);
  return result.success ? result.output : null;
};

export const NoteIdSchema = v.pipe(v.string(), v.regex(/^[A-Za-z0-9_-]{1,64}$/), v.brand("NoteId"));

export type NoteId = v.InferOutput<typeof NoteIdSchema>;

/** A note's id, as the device that made the note minted it (uid in useNotes.ts) */
export const isNoteId = (value: unknown): value is NoteId =>
  v.safeParse(NoteIdSchema, value).success;

export const ImageIdSchema = v.pipe(v.string(), v.regex(UUID), v.brand("ImageId"));

/** A picture kept by the room (its bytes in R2), as the room minted its id */
export type ImageId = v.InferOutput<typeof ImageIdSchema>;

/** An image's id, as the room mints it (a UUID) */
export const isImageId = (value: unknown): value is ImageId =>
  v.safeParse(ImageIdSchema, value).success;
