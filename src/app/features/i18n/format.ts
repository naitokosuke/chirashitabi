import { MessageFormat, type MessagePart } from "messageformat";

import type { Locale } from "./locale";
import { en } from "./messages/en";
import { ja } from "./messages/ja";
import type { MessageId, MessageParams, Messages, Segment } from "./types";

export const MESSAGES: Record<Locale, Messages> = { en, ja };

// compiled on first use; a message is parsed once per locale
const compiled = new Map<string, MessageFormat>();
function compile(locale: Locale, id: MessageId) {
  const cacheKey = `${locale}\u0000${id}`;
  let mf = compiled.get(cacheKey);
  if (mf === undefined) {
    mf = new MessageFormat(locale, MESSAGES[locale][id]);
    compiled.set(cacheKey, mf);
  }
  return mf;
}

/** The message as a string: "Added “Din Tai Fung”" */
export const format = (locale: Locale, id: MessageId, params?: MessageParams) =>
  compile(locale, id).format(params);

/** What one formatted part reads as; an unresolved placeholder reads `{$name}` like `format` does */
function textOf(part: Exclude<MessagePart<never>, { type: "markup" }>): string {
  switch (part.type) {
    case "fallback":
      return `{${part.source}}`;
    case "number":
      return part.parts.map((p) => p.value).join("");
    case "text":
    case "string":
    case "bidiIsolation":
      return part.value;
    default:
      // :unknown and draft functions such as :date carry their own string form
      return typeof part.value === "string" ? part.value : "";
  }
}

/**
 * The message cut at its markup: "Day {$n} {#date}{$date}{/date}" ->
 * text "Day 1 ", then markup "date" holding "Tue, 11/3".
 * Markup nested inside markup is flattened into the outer one's text.
 */
export function segments(locale: Locale, id: MessageId, params?: MessageParams): Segment[] {
  const out: Segment[] = [];
  let open: Extract<Segment, { kind: "markup" }> | null = null;
  let depth = 0;
  for (const [at, part] of compile(locale, id).formatToParts(params).entries()) {
    if (part.type !== "markup") {
      const text = textOf(part);
      const last = out.at(-1);
      if (open !== null) open.text += text;
      else if (last?.kind === "text") last.text += text;
      else out.push({ kind: "text", at, text });
    } else if (part.kind === "open") {
      if (depth++ === 0) out.push((open = { kind: "markup", at, name: part.name, text: "" }));
    } else if (part.kind === "close") {
      if (depth > 0 && --depth === 0) open = null;
    } else if (depth === 0) {
      out.push({ kind: "markup", at, name: part.name, text: "" });
    }
  }
  return out;
}
