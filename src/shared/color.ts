import * as v from "valibot";

/**
 * "#3c6ee0", "#fff" or with an alpha: only a plain hex value, never something like
 * "red; background: url(…)", so it can go into an inline style as it is
 */
export const HexColorSchema = v.pipe(v.string(), v.hexColor(), v.brand("HexColor"));

export type HexColor = v.InferOutput<typeof HexColorSchema>;

export const hexColor = (value: string): HexColor | null => {
  const result = v.safeParse(HexColorSchema, value);
  return result.success ? result.output : null;
};
