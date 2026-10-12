import type { Brand } from "../../shared/brand";

export type NoteId = Brand<string, "NoteId">;

/** A note's id, as the device that made the note minted it (uid in useNotes.ts) */
export const isNoteId = (v: unknown): v is NoteId =>
  typeof v === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(v);

/** A picture kept by the room (its bytes in R2), as the room minted its id */
export type ImageId = Brand<string, "ImageId">;

/** An image's id, as the room mints it (a UUID) */
export const isImageId = (v: unknown): v is ImageId =>
  typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
