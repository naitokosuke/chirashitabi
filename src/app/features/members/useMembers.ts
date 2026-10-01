import { ref } from "vue";

import { defineStore } from "pinia";

import { useI18n } from "../i18n/useI18n";

import type { Member, MemberId } from "./types";

export const useMembers = defineStore("members", () => {
  const i18n = useI18n();
  const members = ref<Member[]>([]);
  /** Who is using this device; their notes are signed with this id. "" until the room says */
  const me = ref("" as MemberId);

  const byId = (id: MemberId) => members.value.find((m) => m.id === id);
  const nameOf = (id: MemberId) => byId(id)?.name ?? i18n.t("member.someone");
  const colorOf = (id: MemberId) => byId(id)?.color ?? "var(--stone-light)";

  /** Called by the room when the member list arrives or changes. */
  function apply(snapshot: Member[]) {
    members.value = snapshot;
  }

  return { members, me, byId, nameOf, colorOf, apply };
});
