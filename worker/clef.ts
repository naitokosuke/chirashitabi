/**
 * Clef on Workers AI (@cf/cloudflare/clef-flash): a model that answers typed questions about a
 * state with probabilities. It only decides among what it is given; it never writes a word, so
 * the tags it judges come from the room and from the agent's candidates (claude.ts).
 * Called through the AI binding, so there is no key; each call is reserved against the
 * person's budget first, like any paid call (docs/auth-and-security.md).
 */

import * as v from "valibot";

/**
 * Clef's answer: for each question (`t0`, `t1`, …), how likely `noul` is; a question it answered
 * some other way has no likelihood
 */
const OutputSchema = v.object({
  answers: v.record(
    v.string(),
    v.fallback(
      v.nullable(
        v.pipe(
          v.object({ noul: v.number() }),
          v.transform(({ noul }) => noul),
        ),
      ),
      null,
    ),
  ),
});

export const CLEF_MODEL = "@cf/cloudflare/clef-flash";

/**
 * A tag this likely or more fits the memo. Every tag goes back with its likelihood, the
 * unlikely ones too, for the form to rank; the form draws the same line (features/tags/rank.ts)
 */
export const FITS_AT = 0.5;
/** Clef takes at most 64 questions a call */
export const MAX_TAGS = 64;

/** A memo as Clef reads it; `image` is its picture, if it has one */
export interface MemoToTag {
  title: string;
  body: string;
  image: { type: string; base64: string } | null;
}

export type ClefResult =
  | { ok: true; tags: { tag: string; p: number }[] }
  /** `refund`: the provider answered with an error, so nothing was spent */
  | { ok: false; refund: boolean; reason: string };

/** Clef's input, as the model's schema has it */
type ClefInput = {
  model: "clef-flash";
  state: unknown;
  questions: Record<
    string,
    { type: "noul"; instructions: string; criteria: { true: string; false: string } }
  >;
  images?: { content_type: string; base64: string }[];
};

/**
 * How likely each tag fits the memo, its text and its picture; every tag Clef answered for,
 * most likely first. Asks one yes/no question per tag, all in one call.
 */
export async function judgeTags(env: Env, memo: MemoToTag, tags: string[]): Promise<ClefResult> {
  const names = tags.slice(0, MAX_TAGS);
  // question ids are the tags' positions: a tag may hold characters an id may not
  const questions: ClefInput["questions"] = Object.fromEntries(
    names.map((tag, i) => [
      `t${i}`,
      {
        type: "noul",
        instructions: `Does this travel note belong under the tag "#${tag}"?`,
        criteria: {
          true: `The note is about something the tag "#${tag}" names.`,
          false: `The tag "#${tag}" does not describe the note.`,
        },
      },
    ]),
  );
  const input: ClefInput = {
    model: "clef-flash",
    state: { title: memo.title, body: memo.body },
    questions,
    ...(memo.image === null
      ? {}
      : { images: [{ content_type: memo.image.type, base64: memo.image.base64 }] }),
  };

  let output: unknown;
  try {
    output = await run(env, input);
  } catch (e) {
    if (e instanceof Refused) return { ok: false, refund: true, reason: e.message };
    // no answer: it may have run, so it counts
    return { ok: false, refund: false, reason: `Clef failed: ${String(e)}` };
  }
  const answered = v.safeParse(OutputSchema, output);
  if (!answered.success)
    return { ok: false, refund: false, reason: "Clef's answer had no answers" };
  const { answers } = answered.output;
  const scored = names
    .flatMap((tag, i) => {
      const p = answers[`t${i}`] ?? null;
      return p === null ? [] : [{ tag, p }];
    })
    .sort((a, b) => b.p - a.p);
  return { ok: true, tags: scored };
}

/** The provider refused the call (a 4xx or 5xx): nothing was spent */
class Refused extends Error {}

/** Through the binding; in the tests, through a stub at CLEF_BASE_URL (the binding needs Cloudflare) */
async function run(env: Env, input: ClefInput): Promise<unknown> {
  if (env.CLEF_BASE_URL !== undefined) {
    const res = await fetch(env.CLEF_BASE_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Refused(`Clef answered ${res.status}`);
    return res.json();
  }
  return env.AI.run(CLEF_MODEL, input);
}
