import type { WireMemo } from "./wire";

/**
 * Claude, called from the Worker with the key held as a secret (docs/auth-and-security.md).
 * One function per thing the room's agent does; each is one paid call, made only after the
 * caller has reserved it against the person's budget (rooms-index.ts).
 */

export const MODEL = "claude-sonnet-5-5";
const API = "https://api.anthropic.com";
const MAX_TOKENS = 2000;

/** What the agent proposes for a day: an order with times, why, and the booklet's intro */
export interface DraftProposal {
  reason: string;
  intro: string;
  items: { id: string; time: string | null }[];
}

export interface Usage {
  input: number;
  output: number;
}

export type ClaudeResult<T> =
  | { ok: true; value: T; usage: Usage }
  /** `refund`: the provider answered with an error, so nothing was spent */
  | { ok: false; refund: boolean; reason: string };

const DRAFT_TOOL = {
  name: "propose_day",
  description: "Propose the order and times for one day of the trip, and an intro for the booklet.",
  input_schema: {
    type: "object",
    properties: {
      reason: {
        type: "string",
        description: "One or two sentences on why this order, for the travellers.",
      },
      intro: {
        type: "string",
        description: "Two or three short lines that open the day's page in the booklet.",
      },
      items: {
        type: "array",
        description: "Every note of the day, in the proposed order.",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "The note's id, exactly as given." },
            time: {
              type: ["string", "null"],
              description: "Start time as HH:MM (24h), or null when any time works.",
            },
          },
          required: ["id", "time"],
        },
      },
    },
    required: ["reason", "intro", "items"],
  },
} as const;

/** The day's notes, as Claude reads them: only what helps to order them */
const describe = (n: WireMemo) => ({
  id: n.id,
  title: n.title,
  body: n.body,
  tags: n.tags,
  place: n.pin,
  time: n.schedule?.time?.slice(0, 5) ?? null,
  status: n.schedule?.status,
  budget: n.budget,
});

/** Asks Claude to order a day; the answer is checked against the notes it was given */
export async function draftDay(
  env: Env,
  day: { trip: string; currency: string; date: string; notes: WireMemo[] },
): Promise<ClaudeResult<DraftProposal>> {
  const prompt = [
    `Trip: ${day.trip}. Amounts are in ${day.currency}.`,
    `Day: ${day.date}.`,
    "Notes on this day (JSON):",
    JSON.stringify(day.notes.map(describe)),
    "",
    "Order these notes into a realistic plan for the day: travel between places, opening hours,",
    "meals at meal times. Keep a time the travellers already set unless it cannot work.",
    "Write `reason` and `intro` in the language the notes are written in.",
  ].join("\n");

  const ids = new Set(day.notes.map((n) => n.id));
  return ask(env, DRAFT_TOOL, prompt, (input) => checkProposal(input, ids), "a draft");
}

/**
 * One call: Claude answers by calling `tool`, and `check` turns its input into the value, or
 * null when it is not one. Every way it can fail says whether anything was spent.
 */
async function ask<T>(
  env: Env,
  tool: { name: string },
  prompt: string,
  check: (input: unknown) => T | null,
  what: string,
): Promise<ClaudeResult<T>> {
  let res: Response;
  try {
    res = await fetch(`${env.ANTHROPIC_BASE_URL ?? API}/v1/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: [
          "You are a member of two friends' trip-planning room, helping them plan their trip.",
          `Always answer by calling the ${tool.name} tool, once, and write nothing else.`,
        ].join(" "),
        tools: [tool],
        // this model does not take a forced tool ("tool" or "any"); the system prompt asks for
        // it, and an answer without the call is not an answer (and is spent)
        tool_choice: { type: "auto" },
        messages: [{ role: "user", content: prompt }],
      }),
    });
  } catch (e) {
    // no answer: it may have run, so it counts
    return { ok: false, refund: false, reason: `request failed: ${String(e)}` };
  }
  if (!res.ok) {
    // the API's own words (type and message, never the request) say what it refused
    const err = (await res.json().catch(() => null)) as {
      error?: { type?: string; message?: string };
    } | null;
    const why =
      err?.error !== undefined
        ? `: ${err.error.type ?? ""} ${err.error.message ?? ""}`.trimEnd()
        : "";
    return { ok: false, refund: true, reason: `Claude answered ${res.status}${why}` };
  }

  const body = (await res.json()) as {
    content?: { type: string; name?: string; input?: unknown }[];
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const usage = { input: body.usage?.input_tokens ?? 0, output: body.usage?.output_tokens ?? 0 };
  const call = body.content?.find((c) => c.type === "tool_use" && c.name === tool.name);
  const value = check(call?.input);
  return value === null
    ? { ok: false, refund: false, reason: `Claude's answer was not ${what}` }
    : { ok: true, value, usage };
}

// ---- tags the trip could use ----

/** At most this many candidate tags a room keeps; Clef judges them with the tags in use */
export const MAX_CANDIDATES = 16;
const CANDIDATE = 20;

const TAGS_TOOL = {
  name: "propose_tags",
  description: "Propose short tags this trip's notes could be sorted under.",
  input_schema: {
    type: "object",
    properties: {
      tags: {
        type: "array",
        description: `Up to ${MAX_CANDIDATES} tags, without '#'.`,
        items: { type: "string", description: `A tag of at most ${CANDIDATE} characters.` },
      },
    },
    required: ["tags"],
  },
} as const;

/** What the agent reads to propose tags: the trip, the tags in use, and the notes' titles */
export interface TagContext {
  trip: string;
  days: string[];
  tags: string[];
  titles: string[];
}

/**
 * Asks Claude for tags this trip's notes could use: kinds of place, food, moments of the
 * trip; the ones in use are not proposed again
 */
export async function proposeTags(env: Env, room: TagContext): Promise<ClaudeResult<string[]>> {
  const prompt = [
    `Trip: ${room.trip}, ${room.days[0] ?? "?"} to ${room.days.at(-1) ?? "?"}.`,
    `Tags in use: ${JSON.stringify(room.tags)}.`,
    "The notes' titles (JSON):",
    JSON.stringify(room.titles.slice(0, 200)),
    "",
    `Propose up to ${MAX_CANDIDATES} more tags the travellers could sort these and later notes`,
    "under: kinds of places, food, shopping, moments of the trip. One or two words each, no '#',",
    "none of the tags in use. Write them in the language the notes are written in.",
  ].join("\n");
  const taken = new Set(room.tags.map((t) => t.toLowerCase()));
  return ask(env, TAGS_TOOL, prompt, (input) => checkTags(input, taken), "tags");
}

/** Claude's tags, trimmed of '#' and space, short, new, no repeats; or null */
export function checkTags(v: unknown, taken: ReadonlySet<string>): string[] | null {
  if (!isRecord(v) || !Array.isArray(v.tags)) return null;
  const out: string[] = [];
  const seen = new Set(taken);
  for (const t of v.tags) {
    const tag = typeof t === "string" ? t.replace(/^#+/, "").trim() : "";
    if (tag === "" || tag.length > CANDIDATE || seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    out.push(tag);
    if (out.length === MAX_CANDIDATES) break;
  }
  return out;
}

// ---- suggestions ----

/** At most this many cards per ask: a handful of ideas, not a flood */
export const MAX_SUGGESTIONS = 3;
const SUGGESTION_TITLE = 60;

const SUGGEST_TOOL = {
  name: "suggest_notes",
  description: "Leave a few new ideas for the trip as suggestion cards on the shared desk.",
  input_schema: {
    type: "object",
    properties: {
      suggestions: {
        type: "array",
        description: `Up to ${MAX_SUGGESTIONS} ideas the notes do not have yet.`,
        items: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description: `The idea as a card's title, at most ${SUGGESTION_TITLE} characters.`,
            },
          },
          required: ["title"],
        },
      },
    },
    required: ["suggestions"],
  },
} as const;

/** What the agent reads to suggest: the trip, and every note as a line */
export interface SuggestContext {
  trip: string;
  days: string[];
  notes: { title: string; tags: string[]; date: string | null }[];
}

/** Asks Claude for a few ideas the notes do not have; the titles are checked */
export async function suggestNotes(
  env: Env,
  room: SuggestContext,
): Promise<ClaudeResult<string[]>> {
  const prompt = [
    `Trip: ${room.trip}, ${room.days[0] ?? "?"} to ${room.days.at(-1) ?? "?"}.`,
    "The notes so far (JSON):",
    JSON.stringify(room.notes),
    "",
    `Suggest up to ${MAX_SUGGESTIONS} places, foods or things to do that would suit this trip and`,
    "that the notes do not have yet. Each is a short card title, concrete enough to look up.",
    "Write them in the language the notes are written in.",
  ].join("\n");
  const taken = new Set(room.notes.map((n) => n.title.trim().toLowerCase()));
  return ask(env, SUGGEST_TOOL, prompt, (input) => checkSuggestions(input, taken), "suggestions");
}

/**
 * Claude's ideas as titles, or null. Trimmed, at most the card's length, none the notes
 * already have, no repeats, at most MAX_SUGGESTIONS; an empty list is a fine answer.
 */
export function checkSuggestions(v: unknown, taken: ReadonlySet<string>): string[] | null {
  if (!isRecord(v) || !Array.isArray(v.suggestions)) return null;
  const out: string[] = [];
  const seen = new Set(taken);
  for (const s of v.suggestions) {
    const title = isRecord(s) ? text(s.title, SUGGESTION_TITLE) : null;
    if (title === null || title === "" || seen.has(title.toLowerCase())) continue;
    seen.add(title.toLowerCase());
    out.push(title);
    if (out.length === MAX_SUGGESTIONS) break;
  }
  return out;
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : null);

/**
 * Claude's answer as a draft, or null. Only notes of the day, each once; a time that is not
 * HH:MM is no time. Exported for the tests.
 */
export function checkProposal(v: unknown, ids: ReadonlySet<string>): DraftProposal | null {
  if (!isRecord(v) || !Array.isArray(v.items)) return null;
  const reason = text(v.reason, 500);
  const intro = text(v.intro, 500);
  if (reason === null || intro === null) return null;
  const seen = new Set<string>();
  const items: DraftProposal["items"] = [];
  for (const it of v.items) {
    if (!isRecord(it) || typeof it.id !== "string" || !ids.has(it.id) || seen.has(it.id)) continue;
    seen.add(it.id);
    items.push({
      id: it.id,
      time: typeof it.time === "string" && TIME.test(it.time) ? it.time : null,
    });
  }
  return { reason, intro, items };
}
