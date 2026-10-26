import { defineParamParser, miss } from "vue-router/experimental";

/**
 * A finite number, as a place's `lat` and `lng` are in a room's URL. A blank value (`lat=`,
 * `lat=%20`) is none, not the 0 Number makes of it.
 */
export const parser = defineParamParser({
  get(value: string) {
    const n = Number(value);
    return value.trim() !== "" && Number.isFinite(n) ? n : miss();
  },
  set: String,
});
