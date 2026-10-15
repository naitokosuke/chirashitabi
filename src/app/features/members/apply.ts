import type { Mutation } from "../sync/types";

import type { Member, MemberId } from "./types";

/** The members after a mutation from `by`; a changed member is a new object, nothing changes in place */
export function applyToMembers(members: Member[], m: Mutation, by: MemberId): Member[] {
  if (m.type !== "member:profile") return members;
  const i = members.findIndex((x) => x.id === by);
  const old = members[i];
  if (old === undefined) return members;
  const next = { ...old, name: m.name, color: m.color };
  return members.map((x, j) => (j === i ? next : x));
}
