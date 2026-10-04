import { hexColor } from "../shared/color";

import type { Member, MemberId } from "../features/members/types";

export const YUKI = "yuki" as MemberId;
export const KEN = "ken" as MemberId;
export const CLAUDE = "claude" as MemberId;

export const mockMembers = (): Member[] => [
  { id: YUKI, kind: "person", role: "owner", name: "Yuki", color: hexColor("#3c6ee0")! },
  { id: KEN, kind: "person", role: "guest", name: "Ken", color: hexColor("#d7263d")! },
  { id: CLAUDE, kind: "agent", name: "Claude", color: hexColor("#D97757")! },
];
