/**
 * The paper a member writes on: their color washed into the white stock, light enough to write
 * on in Paper Ink in either theme, so whose a note is reads off the whole sheet. White for
 * someone who has left the room.
 */
export const paperOf = (color: string | undefined) =>
  color === undefined
    ? "var(--paper-white)"
    : `color-mix(in oklab, ${color} 28%, var(--paper-white))`;
