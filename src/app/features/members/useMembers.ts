import { defineStore } from "pinia";
import { ref } from "vue";
import type { Member } from "./types";

export const useMembers = defineStore("members", () => {
  const members = ref<Member[]>([]);
  /** Who is using this device; their notes are signed with this id */
  const me = ref("");

  const byId = (id: string) => members.value.find((m) => m.id === id);
  const nameOf = (id: string) => byId(id)?.name ?? "Someone";
  const colorOf = (id: string) => byId(id)?.color ?? "var(--stone-light)";

  /** Called by the room when the member list arrives or changes. */
  function apply(snapshot: Member[]) {
    members.value = snapshot;
  }

  return { members, me, byId, nameOf, colorOf, apply };
});
