import * as v from "valibot";

import { HexColorSchema } from "../shared/color";

import { MemberIdSchema, type Member } from "../features/members/types";

// the seed's ids as a room would have minted them: a UUID for a person, `agent:<name>` for its agent
export const YUKI = v.parse(MemberIdSchema, "0b0d6f1e-5c1a-4e8b-9a43-7f2d1c6e9a01");
export const KEN = v.parse(MemberIdSchema, "4e7a2c90-3b5d-4f16-8e21-a9c4d0b7f302");
export const CLAUDE = v.parse(MemberIdSchema, "agent:claude");

export const mockMembers = (): Member[] => [
  {
    id: YUKI,
    kind: "person",
    role: "owner",
    name: "Yuki",
    color: v.parse(HexColorSchema, "#3c6ee0"),
  },
  {
    id: KEN,
    kind: "person",
    role: "guest",
    name: "Ken",
    color: v.parse(HexColorSchema, "#d7263d"),
  },
  { id: CLAUDE, kind: "agent", name: "Claude", color: v.parse(HexColorSchema, "#D97757") },
];
