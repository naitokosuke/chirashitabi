import * as v from "valibot";

/** An ISO 4217 code this runtime can format: "TWD", "JPY", … */
export const CurrencyCodeSchema = v.pipe(
  v.picklist(Intl.supportedValuesOf("currency")),
  v.brand("CurrencyCode"),
);

export type CurrencyCode = v.InferOutput<typeof CurrencyCodeSchema>;

/** The code, or null when Intl does not know it */
export const currencyCode = (code: string): CurrencyCode | null => {
  const result = v.safeParse(CurrencyCodeSchema, code);
  return result.success ? result.output : null;
};
