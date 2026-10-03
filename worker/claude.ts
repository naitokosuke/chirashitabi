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
        system:
          "You are a member of two friends' trip-planning room, helping them shape their days.",
        tools: [DRAFT_TOOL],
        tool_choice: { type: "tool", name: DRAFT_TOOL.name },
        messages: [{ role: "user", content: prompt }],
      }),
    });
  } catch (e) {
    // no answer: it may have run, so it counts
    return { ok: false, refund: false, reason: `request failed: ${String(e)}` };
  }
  if (!res.ok) return { ok: false, refund: true, reason: `Claude answered ${res.status}` };

  const body = (await res.json()) as {
    content?: { type: string; name?: string; input?: unknown }[];
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const usage = { input: body.usage?.input_tokens ?? 0, output: body.usage?.output_tokens ?? 0 };
  const call = body.content?.find((c) => c.type === "tool_use" && c.name === DRAFT_TOOL.name);
  const proposal = checkProposal(call?.input, new Set(day.notes.map((n) => n.id)));
  return proposal === null
    ? { ok: false, refund: false, reason: "Claude's answer was not a draft" }
    : { ok: true, value: proposal, usage };
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
