import type { Member } from "@/features/members/store";

export const mockMembers = (): Member[] => [
  { id: "yuki", name: "Yuki", color: "#3c6ee0" },
  { id: "ken", name: "Ken", color: "#d7263d" },
  { id: "claude", name: "Claude", color: "#D97757" },
];

/** Whose device this mock runs on */
export const mockMe = "yuki";
