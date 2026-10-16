import * as v from "valibot";

/**
 * "#3c6ee0". Colors from the room end up in inline styles, so only a plain
 * hex value may get there, never something like "red; background: url(…)".
 */
export const HexColorSchema = v.pipe(v.string(), v.regex(/^#[0-9a-f]{6}$/i), v.brand("HexColor"));

export type HexColor = v.InferOutput<typeof HexColorSchema>;

export const hexColor = (value: string): HexColor | null => {
  const result = v.safeParse(HexColorSchema, value);
  return result.success ? result.output : null;
};
