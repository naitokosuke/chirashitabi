import { Temporal } from "temporal-polyfill-lite";

import { onActivated, onBeforeUnmount, onMounted, shallowRef } from "vue";

/**
 * Today, for a view that shows it: read again when the view comes back, from another tab while
 * it was kept (KeepAlive), or into sight on a phone woken the next day
 */
export function useToday() {
  const today = shallowRef(Temporal.Now.plainDateISO());
  const read = () => {
    const now = Temporal.Now.plainDateISO();
    if (!now.equals(today.value)) today.value = now;
  };
  onActivated(read);
  onMounted(() => document.addEventListener("visibilitychange", read));
  onBeforeUnmount(() => document.removeEventListener("visibilitychange", read));
  return today;
}
