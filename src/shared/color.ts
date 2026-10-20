import * as v from "valibot";

import { parserOf } from "./parse";

/**
 * "#3c6ee0", "#fff" or with an alpha: only a plain hex value, never something like
 * "red; background: url(…)", so it can go into an inline style as it is
 */
export const HexColorSchema = v.pipe(v.string(), v.hexColor(), v.brand("HexColor"));

export type HexColor = v.InferOutput<typeof HexColorSchema>;

/** The color, or null when it is not a plain hex value */
export const parseHexColor = parserOf(HexColorSchema);
