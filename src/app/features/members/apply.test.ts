import { describe, expect, test } from "vite-plus/test";

import { hexColor } from "../../shared/color";

import { applyToMembers } from "./apply";
import type { Member, MemberId } from "./types";

const YUKI = "yuki" as MemberId;
const KEN = "ken" as MemberId;

describe("applyToMembers", () => {
  const members: Member[] = [
    { id: YUKI, name: "Yuki", color: hexColor("#3c6ee0")! },
    { id: KEN, name: "Ken", color: hexColor("#d7263d")! },
  ];

  test("a profile changes its sender only, as a new object", () => {
    const next = applyToMembers(
      members,
      { type: "member:profile", name: "Kenji", color: hexColor("#1b998b")! },
      KEN,
    );
    expect(next[0]).toBe(members[0]);
    expect(next[1]).toEqual({ id: KEN, name: "Kenji", color: "#1b998b" });
    expect(members[1]?.name).toBe("Ken");
  });

  test("an unknown sender or another mutation keeps the array", () => {
    const profile = { type: "member:profile", name: "x", color: hexColor("#000000")! } as const;
    expect(applyToMembers(members, profile, "nobody" as MemberId)).toBe(members);
    expect(applyToMembers(members, { type: "note:delete", id: "x" as never }, KEN)).toBe(members);
  });
});
