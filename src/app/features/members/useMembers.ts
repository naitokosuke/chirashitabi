import { defineStore } from "pinia";

import { useQueryState } from "@pinia/colada";

import { useI18n } from "../../i18n/useI18n";

import { roomKeys } from "../sync/keys";
import { useSync } from "../sync/useSync";

import type { MemberId } from "./types";

/** The room's members, as the query cache holds them (keys.ts), written by the room */
export const useMembers = defineStore("members", () => {
  const i18n = useI18n();
  const sync = useSync();

  const { data: members } = useQueryState(() => roomKeys.members(sync.roomId));

  const byId = (id: MemberId) => members.value?.find((m) => m.id === id);
  const nameOf = (id: MemberId) => byId(id)?.name ?? i18n.t("member.someone");
  const colorOf = (id: MemberId) => byId(id)?.color ?? "var(--muted)";

  return { members, byId, nameOf, colorOf };
});
