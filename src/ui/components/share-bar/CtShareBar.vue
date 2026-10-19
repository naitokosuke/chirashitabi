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
        :data-tone="p.tone"
        :style="`flex-grow: ${p.count}`"
      ></span>
    </div>
    <ul>
      <li v-for="p in props.parts" :key="p.key" :data-tone="p.tone">
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
[data-tone="full"] {
  --key: var(--ink);
}

[data-tone="half"] {
  --key: color-mix(in oklch, var(--ink) 35%, var(--bg));
}

[data-tone="faint"] {
  --key: color-mix(in oklch, var(--ink) 12%, var(--bg));
}

figure {
  > div {
    display: flex;
    gap: 2px;
    height: 10px;
    border-radius: 999px;
    overflow: hidden;
    background: var(--line);

    > span {
      flex-basis: 0;
      background: var(--key);
    }
  }

  > ul {
    list-style: none;
    margin: 10px 0 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 4px 16px;
    font-size: var(--font-sm);
    color: var(--muted);

    > li {
      display: flex;
      align-items: center;
      gap: 6px;

      > span {
        width: 10px;
        height: 10px;
        border-radius: 3px;
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
