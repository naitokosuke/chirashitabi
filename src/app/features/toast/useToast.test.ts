import { createPinia, setActivePinia } from "pinia";

import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";

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
});
