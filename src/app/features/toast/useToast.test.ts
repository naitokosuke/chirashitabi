import { createPinia, setActivePinia } from "pinia";

import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";

import type { RoomId } from "../rooms/types";
import { opened } from "../sync/session";
import { useSync } from "../sync/useSync";

import { useToast } from "./useToast";

beforeEach(() => {
  vi.useFakeTimers();
  setActivePinia(createPinia());
});
afterEach(() => vi.useRealTimers());

/** A delete with a moment to take it back, as the canvas shows it */
function deleted() {
  const toast = useToast();
  const settle = vi.fn();
  const undo = vi.fn();
  toast.show("Deleted", { undo, settle, focus: true });
  return { toast, settle, undo };
}

describe("a word said while an undo is held", () => {
  test("waits behind it, and is said once it is let go and its time is over", () => {
    const { toast, settle } = deleted();
    toast.hold("focus", true);
    toast.show("Something went wrong");
    expect(toast.current?.text).toBe("Deleted");
    expect(settle).not.toHaveBeenCalled();

    vi.advanceTimersByTime(10_000);
    expect(toast.current?.text).toBe("Deleted");

    toast.hold("focus", false);
    vi.advanceTimersByTime(3200);
    expect(settle).toHaveBeenCalledOnce();
    expect(toast.current?.text).toBe("Something went wrong");
  });

  test("is said once the undo is pressed, and the delete is taken back", () => {
    const { toast, settle, undo } = deleted();
    toast.hold("pointer", true);
    toast.show("Something went wrong");
    toast.undo();
    expect(undo).toHaveBeenCalledOnce();
    expect(settle).not.toHaveBeenCalled();
    expect(toast.current?.text).toBe("Something went wrong");
  });

  test("takes its place at once when nothing holds it", () => {
    const { toast, settle } = deleted();
    toast.show("Something went wrong");
    expect(settle).toHaveBeenCalledOnce();
    expect(toast.current?.text).toBe("Something went wrong");
  });

  test("with an undo of its own, still takes the held one's place", () => {
    const { toast, settle } = deleted();
    toast.hold("focus", true);
    toast.show("Deleted another", { undo: () => {}, settle: () => {} });
    expect(settle).toHaveBeenCalledOnce();
    expect(toast.current?.text).toBe("Deleted another");
  });

  test("goes unsaid once a newer toast with an undo takes the held one's place", () => {
    const { toast } = deleted();
    toast.hold("pointer", true);
    toast.show("Something went wrong");
    toast.show("Deleted another", { undo: () => {}, settle: () => {} });
    toast.hold("pointer", false);

    vi.advanceTimersByTime(3200);
    expect(toast.current).toBeNull();
  });

  test("goes unsaid when its room is left, though what the undo held open goes through", () => {
    const sync = useSync();
    sync.session = opened(ROOM_A, null);
    const { toast, settle } = deleted();
    toast.hold("focus", true);
    toast.show("Something went wrong", { room: ROOM_A });

    // useRoom leaves the toast before the session moves on to the next room
    toast.leaveRoom();
    expect(settle).toHaveBeenCalledOnce();
    expect(toast.current).toBeNull();

    sync.session = opened(ROOM_B, null);
    vi.advanceTimersByTime(10_000);
    expect(toast.current).toBeNull();
  });
});

const ROOM_A = "00000000-0000-4000-8000-00000000000a" as RoomId;
const ROOM_B = "00000000-0000-4000-8000-00000000000b" as RoomId;
