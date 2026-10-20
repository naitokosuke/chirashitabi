// What the contract speaks in but does not own: values with no meaning of the trip in them,
// defined in src/shared and taken from here by the app and the Worker
export type { Brand } from "../shared/brand";
export { parseHexColor, HexColorSchema, type HexColor } from "../shared/color";
export { EmailSchema, parseEmail, type Email } from "../shared/email";
export { listOf } from "../shared/list";
export { parseCurrencyCode, CurrencyCodeSchema, type CurrencyCode } from "../shared/money";
export type { Result } from "../shared/result";
