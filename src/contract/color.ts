import type { Brand } from "./brand";

/**
 * "#3c6ee0". Colors from the room end up in inline styles, so only a plain
 * hex value may get there, never something like "red; background: url(…)".
 */
export type HexColor = Brand<string, "HexColor">;

export const hexColor = (value: string): HexColor | null =>
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the brand is minted here
  /^#[0-9a-f]{6}$/i.test(value) ? (value as HexColor) : null;
