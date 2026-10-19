<script setup lang="ts" vapor>
/**
 * Who someone is in a room, by their color: at `md` or `lg` a face, the first letter of their
 * `name` in white on their color (deepened enough to carry it); at `dot` only a dot of it, beside
 * their name written out. `pending` is a seat held for someone not in yet: the outline of a
 * face. Their name is read where it is written, so this is never read out.
 */
const { size = "md" } = defineProps<{
  color?: string;
  name?: string;
  size?: "dot" | "md" | "lg";
  pending?: boolean;
}>();
</script>

<template>
  <span
    aria-hidden="true"
    :class="[`size-${size}`, { pending }]"
    :style="color === undefined ? undefined : `--who: ${color}`"
  >{{ size === "dot" || pending ? "" : name?.slice(0, 1) }}</span>
</template>

<style scoped>
span {
  flex-shrink: 0;
  display: inline-grid;
  place-items: center;
  width: var(--size-face);
  height: var(--size-face);
  border-radius: 50%;
  background: oklch(from var(--who, var(--muted)) min(l, 0.52) c h);
  color: var(--on-tint);
  font-weight: 700;

  &.size-lg {
    width: var(--size-face-lg);
    height: var(--size-face-lg);
    font-size: var(--font-lg);
  }

  /* beside a name: the color as it is, not deepened, since nothing is written on it */
  &.size-dot {
    width: var(--size-dot);
    height: var(--size-dot);
    background: var(--who, var(--muted));
  }

  &.pending {
    background: transparent;
    border: var(--line-width-drawn) dashed color-mix(in oklch, var(--ink) 35%, transparent);
  }
}
</style>
