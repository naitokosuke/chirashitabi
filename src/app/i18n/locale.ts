export const LOCALES = ["en", "ja"] as const;
export type Locale = (typeof LOCALES)[number];

/** A stored locale, or null when it is missing or not one of ours; the one found is our own */
export const parseLocale = (value: string | null): Locale | null =>
  LOCALES.find((l) => l === value) ?? null;

/** The first of the browser's languages we have messages for: "ja-JP" -> "ja"; "en" otherwise */
export function matchLocale(languages: readonly string[]): Locale {
  for (const tag of languages) {
    const [language = ""] = tag.split("-");
    const locale = parseLocale(language.toLowerCase());
    if (locale !== null) return locale;
  }
  return "en";
}
