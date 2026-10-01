import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type Ref } from "vue";

/** Whichever child marks itself as the current choice */
const SELECTED = '[aria-selected="true"], [aria-checked="true"], [aria-current="page"]';

/**
 * Tracks the selected child of `list` so an indicator can morph to it.
 * `list` must be the indicator's positioned parent.
 */
export function useIndicator(list: Readonly<Ref<HTMLElement | null>>, watchSource: () => unknown) {
  const box = ref({ x: 0, y: 0, width: 0, height: 0 });
  // Stays false until the first position is painted, so the indicator
  // appears in place instead of sliding in from the corner.
  const ready = ref(false);

  async function measure() {
    await nextTick();
    const el = list.value?.querySelector<HTMLElement>(SELECTED) ?? null;
    if (el === null) return;
    box.value = {
      x: el.offsetLeft,
      y: el.offsetTop,
      width: el.offsetWidth,
      height: el.offsetHeight,
    };
    if (!ready.value) requestAnimationFrame(() => (ready.value = true));
  }

  let observer: ResizeObserver | undefined;
  watch(watchSource, () => void measure());
  onMounted(() => {
    void measure();
    observer = new ResizeObserver(() => void measure());
    if (list.value !== null) observer.observe(list.value);
  });
  onBeforeUnmount(() => observer?.disconnect());

  const style = computed(
    () =>
      `width: ${box.value.width}px; height: ${box.value.height}px; transform: translate(${box.value.x}px, ${box.value.y}px)`,
  );
  return { style, ready };
}
