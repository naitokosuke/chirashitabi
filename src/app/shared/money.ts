import type { Brand } from "./brand";

/** An ISO 4217 code this runtime can format: "TWD", "JPY", … */
export type CurrencyCode = Brand<string, "CurrencyCode">;

const KNOWN = new Set(Intl.supportedValuesOf("currency"));

/** The code, or null when Intl does not know it */
export const currencyCode = (code: string): CurrencyCode | null =>
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the brand is minted here
  KNOWN.has(code) ? (code as CurrencyCode) : null;

/** "NT$1,500" for TWD, "¥1,500" for JPY */
export const formatMoney = (amount: number, currency: CurrencyCode, locale: string) =>
  new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
