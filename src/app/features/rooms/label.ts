import type { Temporal } from "temporal-polyfill-lite";

import type { MessageId, MessageParams } from "../../i18n/types";

import { longDate } from "../trip/format";

import type { When } from "./when";

type Translate = (id: MessageId, params?: MessageParams) => string;

/** "11/3(火) – 11/5(木) · 3日間", or one date for a day trip */
export function datesLabel(
  first: Temporal.PlainDate,
  days: number,
  locale: string,
  t: Translate,
): string {
  const from = longDate(first, locale);
  const range = days === 1 ? from : `${from} – ${longDate(first.add({ days: days - 1 }), locale)}`;
  return `${range} · ${t("home.days", { count: days })}`;
}

/** "あと 31 日", "明日から", "旅の途中 · 2 日目"; nothing once the trip is over */
export function whenLabel(when: When, t: Translate): string {
  switch (when.kind) {
    case "ahead":
      return when.in === 1 ? t("rooms.tomorrow") : t("rooms.inDays", { count: when.in });
    case "during":
      return t("rooms.during", { count: when.day });
    case "past":
      return "";
  }
}
