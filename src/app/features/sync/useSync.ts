import { defineStore } from "pinia";
import { shallowRef } from "vue";
import type { Mutation, Transport } from "./types";

export const useSync = defineStore("sync", () => {
  const transport = shallowRef<Transport>({ send: () => {} });
  const send = (msg: Mutation) => transport.value.send(msg);
  return { transport, send };
});
