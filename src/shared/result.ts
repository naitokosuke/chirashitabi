/**
 * A value, or why there is none: an outcome to say, not a failure. A failure (offline, an error
 * from elsewhere) is thrown.
 */
export type Result<T, Reason> = { ok: true; value: T } | { ok: false; reason: Reason };
