# Writing messages

MF2 as this app uses it.
The full syntax is in the [specification](https://unicode.org/reports/tr35/tr35-messageFormat.html); this page covers what the messages here need.

## Adding a message

Add the id and the English text to `messages/en.ts`, then the same id to `messages/ja.ts`.
The type checker reports a locale that is missing it.
Run `vp test` afterwards; it parses every message in every locale.

## Plain text

Most messages are plain text, written as they read.

```ts
"common.fitAll": "Fit all",
```

Braces and backslashes have a meaning, so a literal one is escaped as `\{`, `\}` or `\\` (doubled again inside a TypeScript string).
An unescaped `{b}` is not an error; MF2 reads it as the literal `b` and the braces disappear.

A message cannot start with `.`, which opens a declaration.
Wrap such a message in double braces: `{{.env file}}`.

Leading and trailing spaces are kept.
`shiori.withMaybes` relies on this; it follows another message directly, and English wants a space before its parenthesis where Japanese, with full-width brackets, does not.

```ts
// en.ts
"shiori.withMaybes": " ({$total} with maybes)",
// ja.ts
"shiori.withMaybes": "（候補込みで {$total}）",
```

## Variables

A variable is `{$name}`, filled from the second argument of `t()` or the `params` of `<Message>`.

```ts
"canvas.added": "Added “{$title}”",
```

```ts
i18n.t("canvas.added", { title: n.title });
```

Each locale places the variable where its grammar wants it.

```ts
"canvas.added": "「{$title}」を追加しました",
```

A count goes through `:integer`, which formats it for the locale and makes it selectable.

```ts
"shiori.trayTitle": "Notes without a day · {$count :integer}",
```

Dates, times and money arrive already formatted as strings (see [the README](README.md#the-locale)), so they are plain `{$date}` and `{$total}`.

## Plurals

English needs a different sentence for one and for several.
Declare the count with `.input`, then `.match` on it; each variant is a key and a pattern in double braces, and `*` catches every other case.

```ts
"map.noPin": `
.input {$count :integer}
.match $count
one {{{$count} note has no place · long-press the map to place}}
*   {{{$count} notes have no place · long-press the map to place}}
`,
```

The keys are the locale's plural categories (`zero`, `one`, `two`, `few`, `many`, `other`), or exact numbers such as `0`.
Japanese has only `other`, so the Japanese message is plain and needs no `.match`.

```ts
"map.noPin": "場所のないメモが {$count :integer} 件 · 地図を長押しして置けます",
```

A message with declarations is easier to read on several lines; a template literal keeps the line breaks, and the whitespace around declarations and variants is ignored.

## Selecting on a word

`.match` also chooses on a string with `:string`, for a status or a kind.

```
.input {$kind :string}
.match $kind
memo       {{a note}}
suggestion {{a suggestion}}
*          {{a card}}
```

The `*` variant is required even when every value is listed.
For a label per value with nothing around it, such as the status pill, separate ids read better: `status.idea`, `status.fixed`, `status.done`, picked with ``i18n.t(`status.${status}`)``.

## Markup

Markup marks part of a sentence for the view to render, without HTML in the message.
`{#name}` opens, `{/name}` closes, and `{#name /}` stands alone.

```ts
"shiori.dayHeading": "Day {$n :integer} {#date}{$date}{/date}",
"shiori.dayHeading": "{$n :integer}日目 {#date}{$date}{/date}",
```

`t()` drops the markup and returns the text.
`<Message>` renders the text outside markup as is, and the text inside through the slot of the same name (see [the README](README.md#using-a-message)).
The translation decides where the marked part sits, while the view decides what it looks like.

Markup inside markup is flattened into the outer one: the slot receives all of its text.

## What not to do

- Don't build a sentence from several messages and put them together in the template; word order differs between languages, so a sentence is one message
- Don't put HTML in a message; use markup
- Don't format numbers, dates or money in the template and then join them with text; pass them as variables so each locale places them
