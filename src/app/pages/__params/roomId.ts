import { defineParamParser, miss } from "vue-router/experimental";

import { roomId } from "../../../contract/ids";

export const parser = defineParamParser({
  get: (value: string) => roomId(value) ?? miss(),
  set: (value) => value,
});
