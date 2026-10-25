import { describe, expect, test } from "vite-plus/test";

import { parseHexColor } from "../../../contract";

import { applyToMembers } from "./apply";
import type { Member, MemberId } from "./types";

const YUKI = "yuki" as MemberId;
const KEN = "ken" as MemberId;

describe("applyToMembers", () => {
  const members: Member[] = [
    { id: YUKI, kind: "person", role: "owner", name: "Yuki", color: parseHexColor("#3c6ee0")! },
    { id: KEN, kind: "person", role: "guest", name: "Ken", color: parseHexColor("#d7263d")! },
  ];

  test("a profile changes its sender only, as a new object", () => {
    const next = applyToMembers(
      members,
      { type: "member:profile", name: "Kenji", color: parseHexColor("#1b998b")! },
      KEN,
    );
    expect(next[0]).toBe(members[0]);
    expect(next[1]).toEqual({
      id: KEN,
      kind: "person",
      role: "guest",
      name: "Kenji",
      color: "#1b998b",
    });
    expect(members[1]?.name).toBe("Ken");
  });

  test("an unknown sender or another mutation keeps the array", () => {
    const profile = {
      type: "member:profile",
      name: "x",
      color: parseHexColor("#000000")!,
    } as const;
    expect(applyToMembers(members, profile, "nobody" as MemberId)).toBe(members);
    expect(applyToMembers(members, { type: "note:delete", id: "x" as never }, KEN)).toBe(members);
  });
});
