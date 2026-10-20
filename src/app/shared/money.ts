import type { CurrencyCode } from "../../contract";

// a currency's code, as the app takes it from the contract
export { parseCurrencyCode, CurrencyCodeSchema, type CurrencyCode } from "../../contract";

/** "NT$1,500" for TWD, "¥1,500" for JPY */
export const formatMoney = (amount: number, currency: CurrencyCode, locale: string) =>
  new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
