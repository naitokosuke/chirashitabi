import type { Brand } from "./brand";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** A room's id, as the Worker mints it: a UUID */
export type RoomId = Brand<string, "RoomId">;

/** The id, or null when it is not one the Worker could have made */
export const roomId = (value: unknown): RoomId | null =>
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the brand is minted here
  typeof value === "string" && UUID.test(value) ? (value as RoomId) : null;

export type MemberId = Brand<string, "MemberId">;

/** A member's id, as a room mints it: a UUID for a person, `agent:<name>` for its agent */
export const isMemberId = (v: unknown): v is MemberId =>
  typeof v === "string" && (UUID.test(v) || /^agent:[a-z]+$/.test(v));

/** An e-mail address as a person logs in with it: trimmed and lowercased, one key per person */
export type Email = Brand<string, "Email">;

export type NoteId = Brand<string, "NoteId">;

/** A note's id, as the device that made the note minted it (uid in useNotes.ts) */
export const isNoteId = (v: unknown): v is NoteId =>
  typeof v === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(v);

/** A picture kept by the room (its bytes in R2), as the room minted its id */
export type ImageId = Brand<string, "ImageId">;

/** An image's id, as the room mints it (a UUID) */
export const isImageId = (v: unknown): v is ImageId => typeof v === "string" && UUID.test(v);
