import type { MessageId } from "../../i18n/types";

import type { Note } from "./types";

/**
 * What a note is called wherever it is named (its card, its menu, its toast, an ask from it):
 * its title, a text box's words, and for a sticker, which has no words, what it is
 */
export const noteLabel = (note: Note, t: (id: MessageId) => string): string =>
  note.kind === "sticker" ? t("canvas.sticker") : note.kind === "text" ? note.text : note.title;
