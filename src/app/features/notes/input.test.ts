import { describe, expect, test } from "vite-plus/test";

import { parseNoteText } from "./input";

describe("parseNoteText", () => {
  test("a #tag in the title becomes a tag and leaves the title", () => {
    expect(parseNoteText("Din Tai Fung #Food")).toEqual({
      title: "Din Tai Fung",
      body: "",
      tags: ["Food"],
    });
  });

  test("a #tag in the body leaves the body too, and the spacing closes up", () => {
    expect(parseNoteText("Lunch\nmain shop #Food   has a queue\n#Taipei")).toEqual({
      title: "Lunch",
      body: "main shop has a queue",
      tags: ["Food", "Taipei"],
    });
  });

  test("a #word too long for a tag stays in the words, as the room would keep no such tag", () => {
    const long = "x".repeat(41);
    expect(parseNoteText(`Lunch #${long} #Food`)).toEqual({
      title: `Lunch #${long}`,
      body: "",
      tags: ["Food"],
    });
  });

  test("a title that is only tags keeps its words, so the note is never blank", () => {
    expect(parseNoteText("#Packing")).toEqual({ title: "#Packing", body: "", tags: ["Packing"] });
  });

  test("Japanese text and full-width spaces pass through", () => {
    expect(parseNoteText("鼎泰豊で小籠包 #ごはん\n11時に並ぶ")).toEqual({
      title: "鼎泰豊で小籠包",
      body: "11時に並ぶ",
      tags: ["ごはん"],
    });
  });
});
