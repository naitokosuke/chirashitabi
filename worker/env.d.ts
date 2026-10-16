// What `wrangler types` cannot know from wrangler.jsonc: a secret, and vars that only the tests set.
// `Env` is the global interface the generated file declares; this merges into it.
interface Env {
  /** Where identify() fetches the Access signing keys; unset in production */
  ACCESS_CERTS_URL?: string;
  /** The Claude API key, a Worker secret (`wrangler secret put ANTHROPIC_API_KEY`) */
  ANTHROPIC_API_KEY: string;
  /** Where Claude is called; unset in production, a local stub in the tests */
  ANTHROPIC_BASE_URL?: string;
  /** Where Clef is called instead of the AI binding; only the tests set it */
  CLEF_BASE_URL?: string;
  /** Where places are looked up (geocode.ts); unset in production, a local stub in the tests */
  GEOCODER_BASE_URL?: string;
  /** Where short Google Maps links are expanded (expand.ts); unset in production, a stub in the tests */
  SHORTLINK_BASE_URL?: string;
  /** Where pages are fetched for a link's preview (preview.ts); unset in production, a stub in the tests */
  PREVIEW_BASE_URL?: string;
}
