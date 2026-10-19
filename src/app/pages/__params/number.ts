import { defineParamParser, miss } from "vue-router/experimental";

/** A finite number, as a place's `lat` and `lng` are in a room's URL */
export const parser = defineParamParser({
  get(value: string) {
    const n = Number(value);
    return value !== "" && Number.isFinite(n) ? n : miss();
  },
  set: String,
});
