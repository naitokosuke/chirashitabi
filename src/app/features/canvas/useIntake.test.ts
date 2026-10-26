import { Temporal } from "temporal-polyfill-lite";

import { createApp } from "vue";

import { createPinia, setActivePinia } from "pinia";

import { PiniaColada } from "@pinia/colada";
import * as v from "valibot";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";

import { useI18n } from "../../i18n/useI18n";

import { MemberIdSchema } from "../members/types";
import { NoteIdSchema } from "../notes/id";
import { RoomIdSchema } from "../rooms/types";
import { opened } from "../sync/session";
import { useSync } from "../sync/useSync";
import { reviveTrip, WireTripSchema } from "../sync/wire";
import { useToast } from "../toast/useToast";
import { roomWorkerApi } from "../worker/api";

import { useIntake, type Intake } from "./useIntake";

const ROOM = v.parse(RoomIdSchema, "b082573b-b38b-4298-90be-f034f8b7d898");
const YUKI = v.parse(MemberIdSchema, "0b0d6f1e-5c1a-4e8b-9a43-7f2d1c6e9a01");
const trip = reviveTrip(
  v.parse(WireTripSchema, {
    name: "Taiwan trip",
    days: [{ date: "2026-11-03", intro: "" }],
    currency: "TWD",
    center: { lat: 25.05, lng: 121.54 },
    flights: { out: null, back: null },
    stays: [],
  }),
);

const photo = new File(["photo"], "photo.jpg", { type: "image/jpeg" });
const notes = new File(["notes"], "notes.txt", { type: "text/plain" });

/** A drag or a drop onto the desk, carrying `files` (as a list) of `types` */
function dragOf(files: File[], types = files.length > 0 ? ["Files"] : ["text/plain"]) {
  const e = {
    dataTransfer: { types, files, dropEffect: "none" },
    clientX: 120,
    clientY: 80,
    preventDefault: vi.fn(),
  };
  return { e, event: e as unknown as DragEvent };
}

/** The file input a picture is picked with, holding `files` */
class FileInput {
  value = "C:\\fakepath\\photo.jpg";
  constructor(readonly files: File[]) {}
}

/**
 * The desk's intake in a room, in Node: no canvas to shrink a picture with, so the browser's
 * createImageBitmap is the test's, and records each picture it is handed. What is placed on
 * the desk is recorded too.
 */
function setup() {
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("document", Object.assign(new EventTarget(), { documentElement: { lang: "" } }));
  vi.stubGlobal("navigator", { onLine: true, languages: ["en"] });
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {} });
  vi.stubGlobal("HTMLInputElement", FileInput);
  const read: Blob[] = [];
  const bitmap = {
    next: (): Promise<never> => Promise.reject(new Error("cannot read")),
  };
  vi.stubGlobal("createImageBitmap", (b: Blob) => {
    read.push(b);
    return bitmap.next();
  });
  // a lifecycle hook outside a component is warned about; the desk is not mounted here
  vi.spyOn(console, "warn").mockImplementation(() => {});

  const app = createApp({});
  const pinia = createPinia();
  app.use(pinia).use(PiniaColada);
  setActivePinia(pinia);
  const sync = app.runWithContext(() => useSync());
  sync.session = opened(ROOM, { me: YUKI, savedAt: Temporal.Instant.from("2026-10-01T00:00:00Z") });
  const toast = app.runWithContext(() => useToast());
  const i18n = app.runWithContext(() => useI18n());
  const placed: Intake[] = [];
  const intake = app.runWithContext(() =>
    useIntake({ room: ROOM, me: YUKI, trip, api: roomWorkerApi(ROOM) }, (what) => {
      placed.push(what);
      return v.parse(NoteIdSchema, "n1");
    }),
  );
  return { intake, toast, i18n, read, bitmap, placed };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("dragging over the desk", () => {
  test("a dragged file is taken, as a copy", () => {
    const { intake } = setup();
    const { e, event } = dragOf([photo]);
    intake.onDragOver(event);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(e.dataTransfer.dropEffect).toBe("copy");
  });

  test("dragged words are not the desk's to take", () => {
    const { intake } = setup();
    const { e, event } = dragOf([]);
    intake.onDragOver(event);
    expect(e.preventDefault).not.toHaveBeenCalled();
    expect(e.dataTransfer.dropEffect).toBe("none");
  });
});

describe("dropping on the desk", () => {
  test("without a picture among the files, nothing is taken", async () => {
    const { intake, read, placed } = setup();
    const { e, event } = dragOf([notes]);
    intake.onDrop(event);
    await vi.advanceTimersByTimeAsync(0);
    expect(e.preventDefault).not.toHaveBeenCalled();
    expect(read).toEqual([]);
    expect(placed).toEqual([]);
  });

  test("the first picture among the files is the one stuck", () => {
    const { intake, read } = setup();
    const second = new File(["second"], "second.png", { type: "image/png" });
    const { e, event } = dragOf([notes, photo, second]);
    intake.onDrop(event);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(read).toEqual([photo]);
  });

  test("one sticker at a time: a picture dropped while another is on its way is not taken", async () => {
    const { intake, read, bitmap } = setup();
    let fail: (reason: Error) => void = () => {};
    bitmap.next = () => new Promise((_, reject) => (fail = reject));
    intake.onDrop(dragOf([photo]).event);
    expect(intake.sticking.value).toBe(true);
    intake.onDrop(dragOf([photo]).event);
    expect(read).toHaveLength(1);

    fail(new Error("cannot read"));
    await vi.advanceTimersByTimeAsync(0);
    expect(intake.sticking.value).toBe(false);
    intake.onDrop(dragOf([photo]).event);
    expect(read).toHaveLength(2);
  });

  test("a picture that cannot be read is told in the room, and nothing is stuck", async () => {
    const { intake, toast, i18n, placed } = setup();
    intake.onDrop(dragOf([photo]).event);
    await vi.advanceTimersByTimeAsync(0);
    expect(toast.current?.text).toBe(i18n.t("canvas.stickerFailed"));
    expect(toast.current?.room).toBe(ROOM);
    expect(placed).toEqual([]);
  });
});

describe("picking a picture", () => {
  test("the picked picture is stuck, and the input is cleared so it can be picked again", () => {
    const { intake, read } = setup();
    const input = new FileInput([photo]);
    intake.onStickerPicked({ target: input } as unknown as Event);
    expect(read).toEqual([photo]);
    expect(input.value).toBe("");
  });

  test("nothing picked, nothing is stuck", () => {
    const { intake, read } = setup();
    const input = new FileInput([]);
    intake.onStickerPicked({ target: input } as unknown as Event);
    expect(read).toEqual([]);
    expect(input.value).toBe("");
  });

  test("an event from anything but a file input is not a picture picked", () => {
    const { intake, read } = setup();
    intake.onStickerPicked({ target: { files: [photo], value: "" } } as unknown as Event);
    expect(read).toEqual([]);
  });
});
