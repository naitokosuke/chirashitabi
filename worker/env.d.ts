// What `wrangler types` cannot know from wrangler.jsonc: a var that only the tests set.
// `Env` is the global interface the generated file declares; this merges into it.
interface Env {
  /** Where identify() fetches the Access signing keys; unset in production */
  ACCESS_CERTS_URL?: string;
}
