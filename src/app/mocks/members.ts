// oxlint-disable typescript/no-unsafe-type-assertion -- the seed's ids and codes are minted here
import type { HexColor } from "../../contract/color";
import type { MemberId } from "../../contract/ids";
import type { Member } from "../features/members/types";

export const YUKI = "yuki" as MemberId;
export const KEN = "ken" as MemberId;
export const CLAUDE = "claude" as MemberId;

export const mockMembers = (): Member[] => [
  { id: YUKI, kind: "person", role: "owner", name: "Yuki", color: "#3c6ee0" as HexColor },
  { id: KEN, kind: "person", role: "guest", name: "Ken", color: "#d7263d" as HexColor },
  { id: CLAUDE, kind: "agent", name: "Claude", color: "#D97757" as HexColor },
];
