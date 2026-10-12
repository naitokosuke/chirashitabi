export const LOCALES = ["en", "ja"] as const;
export type Locale = (typeof LOCALES)[number];

const isLocale = (value: string): value is Locale => LOCALES.some((l) => l === value);

/** The first of the browser's languages we have messages for: "ja-JP" -> "ja"; "en" otherwise */
export function matchLocale(languages: readonly string[]): Locale {
  for (const tag of languages) {
    const [language = ""] = tag.split("-");
    const lower = language.toLowerCase();
    if (isLocale(lower)) return lower;
  }
  return "en";
}

/** A stored locale, or null when it is missing or not one of ours */
export const parseLocale = (value: string | null): Locale | null =>
  value !== null && isLocale(value) ? value : null;
