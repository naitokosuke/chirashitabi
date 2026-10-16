import { describe, expect, test } from "vite-plus/test";

import { isImageId, isMemberId, isNoteId, parseEmail, roomId } from "./ids";

const UUID = "0f8fad5b-d9cb-469f-a165-70867728950e";

describe("roomId", () => {
  test("a UUID, as it is", () => expect(roomId(UUID)).toBe(UUID));
  test("not one the Worker could have made", () => {
    expect(roomId(UUID.toUpperCase())).toBeNull();
    expect(roomId(`${UUID} `)).toBeNull();
    expect(roomId(42)).toBeNull();
  });
});

describe("isMemberId", () => {
  test("a person's UUID or the agent's name", () => {
    expect(isMemberId(UUID)).toBe(true);
    expect(isMemberId("agent:claude")).toBe(true);
  });
  test("nothing else", () => {
    expect(isMemberId("agent:")).toBe(false);
    expect(isMemberId("agent:Claude")).toBe(false);
    expect(isMemberId(null)).toBe(false);
  });
});

describe("parseEmail", () => {
  test("trimmed and lowercased", () =>
    expect(parseEmail("  Pat@Example.COM ")).toBe("pat@example.com"));
  test("the length counts what was given, spaces and all", () => {
    const local = "a".repeat(240);
    expect(parseEmail(`${local}@example.com`)).not.toBeNull();
    expect(parseEmail(`${" ".repeat(10)}${local}@example.com`)).toBeNull();
  });
  test("not an address", () => {
    expect(parseEmail("pat@example")).toBeNull();
    expect(parseEmail("pat @example.com")).toBeNull();
    expect(parseEmail(undefined)).toBeNull();
  });
});

describe("isNoteId", () => {
  test("up to 64 of letters, digits, _ and -", () => {
    expect(isNoteId("a_B-3")).toBe(true);
    expect(isNoteId("x".repeat(64))).toBe(true);
  });
  test("nothing else", () => {
    expect(isNoteId("")).toBe(false);
    expect(isNoteId("x".repeat(65))).toBe(false);
    expect(isNoteId("a.b")).toBe(false);
  });
});

describe("isImageId", () => {
  test("a UUID only", () => {
    expect(isImageId(UUID)).toBe(true);
    expect(isImageId("agent:claude")).toBe(false);
  });
});
