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
    :data-size="size"
    :data-pending="pending || undefined"
    :style="color === undefined ? undefined : `--who: ${color}`"
  >{{ size === "dot" || pending ? "" : name?.slice(0, 1) }}</span>
</template>

<style scoped>
span {
  flex-shrink: 0;
  display: inline-grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: oklch(from var(--who, var(--muted)) min(l, 0.52) c h);
  color: var(--on-tint);
  font-weight: 700;

  &[data-size="lg"] {
    width: 40px;
    height: 40px;
    font-size: var(--font-lg);
  }

  /* beside a name: the color as it is, not deepened, since nothing is written on it */
  &[data-size="dot"] {
    width: 8px;
    height: 8px;
    background: var(--who, var(--muted));
  }

  &[data-pending] {
    background: transparent;
    border: 1.5px dashed color-mix(in oklch, var(--ink) 35%, transparent);
  }
}
</style>
