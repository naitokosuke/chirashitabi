export const LOCALES = ["en", "ja"] as const;
export type Locale = (typeof LOCALES)[number];

const isLocale = (value: string): value is Locale => (LOCALES as readonly string[]).includes(value);

/** The first of the browser's languages we have messages for: "ja-JP" -> "ja"; "en" otherwise */
export function matchLocale(languages: readonly string[]): Locale {
  for (const tag of languages) {
    const language = tag.split("-")[0]!.toLowerCase();
    if (isLocale(language)) return language;
  }
  return "en";
}

/** A stored locale, or null when it is missing or not one of ours */
export const parseLocale = (value: string | null): Locale | null =>
  value !== null && isLocale(value) ? value : null;
