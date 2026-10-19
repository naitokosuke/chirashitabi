<script setup lang="ts" vapor>
/**
 * How a whole splits into parts: one bar, each part's length its share, and under it a key
 * naming each with its count. A part's `tone` is how much ink it takes, from `full` to `faint`,
 * so the parts are told apart without a color. All counts at 0 leave the bar empty.
 */
const props = defineProps<{
  parts: readonly {
    key: string;
    label: string;
    count: number;
    tone: "full" | "half" | "faint";
  }[];
}>();
</script>

<template>
  <figure>
    <div aria-hidden="true">
      <span
        v-for="p in props.parts"
        :key="p.key"
        :class="`tone-${p.tone}`"
        :style="`flex-grow: ${p.count}`"
      ></span>
    </div>
    <ul>
      <li v-for="p in props.parts" :key="p.key" :class="`tone-${p.tone}`">
        <span aria-hidden="true"></span>{{ p.label }}<b>{{ p.count }}</b>
      </li>
    </ul>
  </figure>
</template>

<style scoped>
:where(figure) {
  margin: 0;
}

/* each part's ink, shared by its piece of the bar and its key */
.tone-full {
  --key: var(--ink);
}

.tone-half {
  --key: color-mix(in oklch, var(--ink) 35%, var(--bg));
}

.tone-faint {
  --key: color-mix(in oklch, var(--ink) 12%, var(--bg));
}

figure {
  > div {
    display: flex;
    gap: var(--space-1);
    height: var(--size-key);
    border-radius: var(--radius-pill);
    overflow: hidden;
    background: var(--line);

    > span {
      flex-basis: 0;
      background: var(--key);
    }
  }

  > ul {
    list-style: none;
    margin: var(--space-5) 0 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2) var(--space-8);
    font-size: var(--font-sm);
    color: var(--muted);

    > li {
      display: flex;
      align-items: center;
      gap: var(--space-3);

      > span {
        width: var(--size-key);
        height: var(--size-key);
        border-radius: var(--radius-1);
        background: var(--key);
      }

      > b {
        color: var(--ink);
        font-variant-numeric: tabular-nums;
      }
    }
  }
}
</style>
