import { shallowReactive } from "vue";

/**
 * One ask that answers later (the Worker reading a link, a photo kept, Clef's tags), as one
 * state, a `kind` at a time, where only the latest ask's answer counts. `ask` puts the state at
 * what asking shows and hands back that ask's turn: once its answer is in, `current()` says
 * whether nothing overtook it, and `settle` writes what came of it, or nothing when something
 * did. `set` puts the state at once and overtakes any ask on its way, as a new ask does, so an
 * earlier one answering late changes nothing.
 */
export function useAsk<S extends { kind: string }>(start: S) {
  const held = shallowReactive({ state: start });
  let latest = 0;
  function set(next: S) {
    latest++;
    held.state = next;
  }
  function ask(asking: S) {
    set(asking);
    const mine = latest;
    const current = () => mine === latest;
    return {
      current,
      settle(next: S) {
        if (current()) held.state = next;
      },
    };
  }
  return {
    /** What the ask is doing, or what came of the latest one */
    get state() {
      return held.state;
    },
    ask,
    set,
  };
}
