import * as v from "valibot";

import { parserOf } from "./parse";

/** An ISO 4217 code this runtime can format: "TWD", "JPY", … */
export const CurrencyCodeSchema = v.pipe(
  v.picklist(Intl.supportedValuesOf("currency")),
  v.brand("CurrencyCode"),
);

export type CurrencyCode = v.InferOutput<typeof CurrencyCodeSchema>;

/** The code, or null when Intl does not know it */
export const parseCurrencyCode = parserOf(CurrencyCodeSchema);
