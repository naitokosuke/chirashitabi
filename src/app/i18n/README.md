# i18n

The UI text of chirashitabi, in English and Japanese, written in [Unicode MessageFormat 2](https://unicode.org/reports/tr35/tr35-messageFormat.html) (MF2)

- [Writing messages](docs/writing-messages.md) covers MF2 as this app uses it, from a plain string to plurals and markup
- [Adding a locale](docs/adding-a-locale.md) lists what a new language needs

## Why a layer of our own

vue-i18n has its own message format and does not read MF2 yet.
Its maintainer plans MF2 support for v12, which is still in alpha (see [#1](https://github.com/naitokosuke/chirashitabi/issues/1)).
So this feature wraps the [`messageformat`](https://github.com/messageformat/messageformat) package, the reference implementation of MF2, in a few small modules.
The messages themselves are plain MF2, so they should carry over to vue-i18n v12 or another MF2 runtime unchanged.

## How it fits together

```
messages/en.ts, ja.ts    MF2 source per locale, keyed by message id
        │
format.ts                compiles a message once per locale; format() -> string,
        │                segments() -> the message cut at its markup
        │
useI18n.ts               Pinia store: locale, setLocale(), t(), parts()
        │
templates                {{ i18n.t("shiori.publish") }}
Message.vue              <Message id="shiori.dayHeading"> with one slot per markup name
```

`locale.ts`, `format.ts` and `types.ts` do not import Vue, so they can be used and tested without a component.

## Messages

`messages/en.ts` is the source.
Its keys define `MessageId`, and `t()` and `<Message>` only accept those ids.
`messages/ja.ts` is typed as `Messages`, so a message missing from it, or one it has that English does not, is a type error.

Ids are grouped by where the text appears: `common.*` for text used in several places, then `nav.*`, `canvas.*`, `form.*`, `map.*`, `shiori.*` and so on.

## The locale

`useI18n().locale` is `"en"` or `"ja"`.
On boot it is the locale picked earlier on this device (`localStorage`, key `chirashitabi:locale`), or else the first of `navigator.languages` that we have messages for, or else English.
`setLocale()` changes it and remembers it.
The store keeps `<html lang>` in step, so screen readers and the browser's hyphenation follow.

There is no control in the UI to switch yet.
During development, `setLocale("en")` on the `i18n` store in Vue devtools does it.

Dates and money are formatted outside the messages, by `features/trip/format.ts` and `shared/money.ts`, which take the locale as an argument.
A view passes `i18n.locale` and hands the formatted string to the message as a variable.
MF2's own `:date` would read a `Temporal.PlainDate` as a JavaScript `Date` at UTC midnight and can show the day before in a timezone west of UTC.

## Using a message

In a template or a store, a message is a string.

```vue
<button type="button" @click="fitAll">{{ i18n.t("common.fitAll") }}</button>
<p class="nopin">{{ i18n.t("map.noPin", { count: noPin }) }}</p>
```

`t()` reads the locale, so whatever renders it updates when the locale changes.
Labels kept in a constant, such as `CtOption` lists, have to be a `computed` for the same reason.

When a message has markup, `<Message>` renders it and each markup name becomes a slot that receives the text inside.

```vue
<h2 class="day">
  <Message id="shiori.dayHeading" :params="{ n: trip.dayNumber(day), date: longDate(day, i18n.locale) }">
    <template #date="{ text }"><span>{{ text }}</span></template>
  </Message>
</h2>
```

A markup name without a slot renders its text as is.

## Tests

`format.test.ts` parses every message in every locale, so a syntax error fails `vp test` instead of showing up in a screen nobody opened.
It also covers plural selection, `segments()` and `matchLocale()`.

## Known gaps

- `t()` takes its variables as `Record<string, unknown>`, so a misspelled `$name` is not caught by the type checker; it renders as `{$name}` and logs a warning
- The values put into a message are wrapped in invisible bidi isolation marks (U+2068 … U+2069), which keeps right-to-left names from scrambling the sentence; they show up in `innerText` and in string comparisons
- Tag names and the mock trip are data, not UI, and are not translated
