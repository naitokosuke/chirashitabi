import { computed, ref } from "vue";

import { defineStore } from "pinia";

import { useQueryCache } from "@pinia/colada";

import { useI18n } from "../../i18n/useI18n";

import { roomKey } from "../sync/keys";
import { useSync } from "../sync/useSync";

import type { Member, MemberId } from "./types";

/**
 * The room's members, as the query cache holds them under `roomKey(room, "members")`, written
 * by the room (docs/data-fetching.md). Who this device is (`me`) is not room data and stays here.
 */
export const useMembers = defineStore("members", () => {
  const i18n = useI18n();
  const sync = useSync();
  const queryCache = useQueryCache();
  const key = computed(() => roomKey(sync.roomId, "members"));
  const members = computed(() => queryCache.getQueryData<Member[]>(key.value) ?? []);
  /** Who is using this device; their notes are signed with this id. "" until the room says */
  const me = ref("" as MemberId);

  const byId = (id: MemberId) => members.value.find((m) => m.id === id);
  const nameOf = (id: MemberId) => byId(id)?.name ?? i18n.t("member.someone");
  const colorOf = (id: MemberId) => byId(id)?.color ?? "var(--muted)";

  return { members, me, byId, nameOf, colorOf };
});
