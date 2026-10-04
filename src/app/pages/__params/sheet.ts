import { defineParamParser, miss } from "vue-router/experimental";

/** The `sheet` query param: the memo sheet a room's URL has open, writing one or editing one */
export const parser = defineParamParser({
  get: (value: string) => (value === "write" || value === "edit" ? value : miss()),
  set: (value) => value,
});
