import * as v from "valibot";
import { describe, expect, test } from "vite-plus/test";

import { RoomIdSchema } from "../rooms/types";

import { parseImageId } from "./id";
import { imageSrc } from "./image";

const ROOM = v.parse(RoomIdSchema, "b082573b-b38b-4298-90be-f034f8b7d898");
const PICTURE = parseImageId("0f8fad5b-d9cb-469f-a165-70867728950e")!;

describe("imageSrc", () => {
  test("is the room's picture on this origin, as the Worker's route has it", () => {
    expect(imageSrc(ROOM, PICTURE)).toBe(`/api/rooms/${ROOM}/images/${PICTURE}`);
  });

  test("names the room it is in, so a picture of another room is another address", () => {
    const other = v.parse(RoomIdSchema, "5d7c2f0e-8a41-4b3e-9f60-2c1d7e8b9a10");
    expect(imageSrc(other, PICTURE)).not.toBe(imageSrc(ROOM, PICTURE));
  });
});
