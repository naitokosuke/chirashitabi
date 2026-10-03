import { computed, ref } from "vue";

import { defineStore } from "pinia";

import { useQueryCache } from "@pinia/colada";

import { useI18n } from "../../i18n/useI18n";

import { roomKey } from "../sync/keys";
import type { Mutation } from "../sync/types";
import { useSync } from "../sync/useSync";

import { applyToMembers } from "./apply";
import type { Member, MemberId } from "./types";

/**
 * The room's members, as they sit in the query cache under `roomKey(room, "members")`,
 * replaced and never changed in place (docs/data-fetching.md). Who this device is (`me`) is
 * not room data and stays here.
 */
export const useMembers = defineStore("members", () => {
  const i18n = useI18n();
  const sync = useSync();
  const queryCache = useQueryCache();
  const key = computed(() => roomKey(sync.roomId, "members"));
  const members = computed(() => queryCache.getQueryData<Member[]>(key.value) ?? []);
  const write = (next: Member[]) => queryCache.setQueryData(key.value, next);
  /** Who is using this device; their notes are signed with this id. "" until the room says */
  const me = ref("" as MemberId);

  const byId = (id: MemberId) => members.value.find((m) => m.id === id);
  const nameOf = (id: MemberId) => byId(id)?.name ?? i18n.t("member.someone");
  const colorOf = (id: MemberId) => byId(id)?.color ?? "var(--muted)";

  /** Called by the room when the member list arrives or changes. */
  function apply(snapshot: Member[]) {
    write(snapshot);
  }

  /** A member's profile as the room relays it: applied, never sent */
  function receive(m: Mutation, by: MemberId) {
    const next = applyToMembers(members.value, m, by);
    if (next !== members.value) write(next);
  }

  return { members, me, byId, nameOf, colorOf, apply, receive };
});
