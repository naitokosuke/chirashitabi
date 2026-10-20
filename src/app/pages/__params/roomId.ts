import { defineParamParser, miss } from "vue-router/experimental";

import { parseRoomId } from "../../features/rooms/types";

export const parser = defineParamParser({
  get: (value: string) => parseRoomId(value) ?? miss(),
  set: (value) => value,
});
