# Adding a locale

What a new language, say Traditional Chinese for the people we travel to Taiwan with, needs

## The code

- Add its tag to `LOCALES` in `locale.ts`
- Create `messages/<tag>.ts` exporting a `Messages` object, starting from a copy of `en.ts`
- Register it in `MESSAGES` in `format.ts`

The type checker then reports every id the new file is missing, and `vp test` parses each of its messages, since the parse test runs over `LOCALES`.

Dates and money need nothing; `features/trip/format.ts` and `shared/money.ts` hand the locale to `Intl`.

## The tag

`matchLocale()` compares only the language part of the browser's tags: `ja-JP` matches `ja`.
That is enough for `en` and `ja`, but `zh-TW` and `zh-CN` would both become `zh`.
A locale that needs its region or script, such as `zh-Hant`, needs `matchLocale()` to compare the whole tag first; `Intl.Locale` can fill in the script (`new Intl.Locale("zh-TW").maximize().script` is `"Hant"`).

## The translation

Plural messages need the new language's own categories, not English's `one` and `*`.
Chinese, like Japanese, has only `other`, so its plural messages are plain text; Arabic has six categories.
[CLDR's plural rules](https://www.unicode.org/cldr/charts/latest/supplemental/language_plural_rules.html) list them per language.

Markup and variables can move anywhere in the sentence, but each one in the English message should stay in the translation: a missing variable just leaves a value out, and a missing markup leaves its slot unused.
