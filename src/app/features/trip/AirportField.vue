<script setup lang="ts" vapor>
import { computed, ref } from "vue";

import { useI18n } from "../../i18n/useI18n";

import { findAirport, suggestAirports, type Airport } from "../place/airports";
import { useAirports } from "../place/useAirports";

import { MAX_PLACE } from "./settings";

/**
 * An airport, typed: its code, its name or a Japanese name, with the airports it may mean
 * offered under it as it is typed; one chosen is written as its code. Under the field, the
 * airport it names, or that it names none on the map.
 */
const props = defineProps<{ id: string; label: string; modelValue: string; placeholder: string }>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const i18n = useI18n();
const airports = useAirports();

const open = ref(false);
/** The option the arrow keys are on, -1 for none */
const active = ref(-1);
const offered = computed(() =>
  open.value ? suggestAirports(airports.value, props.modelValue) : [],
);
const named = computed(() => findAirport(airports.value, props.modelValue));
const listId = computed(() => `${props.id}-airports`);
const optionId = (i: number) => `${props.id}-airport-${i}`;

function onInput(e: Event) {
  emit("update:modelValue", (e.target as HTMLInputElement).value);
  open.value = true;
  active.value = -1;
}
function choose(a: Airport) {
  emit("update:modelValue", a.code);
  open.value = false;
}
/** Down and up walk the airports offered, Enter takes the one walked to, Esc closes them */
function onKey(e: KeyboardEvent) {
  const n = offered.value.length;
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    if (n === 0) return;
    e.preventDefault();
    open.value = true;
    if (e.key === "ArrowDown") active.value = (active.value + 1) % n;
    else active.value = active.value <= 0 ? n - 1 : active.value - 1;
  } else if (e.key === "Enter" && active.value >= 0) {
    const a = offered.value[active.value];
    if (a !== undefined) {
      e.preventDefault();
      choose(a);
    }
  } else if (e.key === "Escape" && open.value) {
    e.stopPropagation();
    open.value = false;
  }
}
const place = (a: Airport) => [a.city, a.country].filter((s) => s !== "").join(", ");
</script>

<template>
  <div class="airport">
    <label :for="id">{{ label }}</label>
    <input
      :id
      autocapitalize="characters"
      autocomplete="off"
      :aria-activedescendant="active >= 0 ? optionId(active) : undefined"
      :aria-controls="listId"
      :aria-expanded="offered.length > 0"
      aria-autocomplete="list"
      :maxlength="MAX_PLACE"
      :placeholder
      required
      role="combobox"
      :value="modelValue"
      @blur="() => (open = false)"
      @input="onInput"
      @keydown="onKey"
    />
    <ul v-if="offered.length > 0" :id="listId" role="listbox">
      <!-- pointerdown, not click: the field would lose focus first, and the list with it -->
      <li
        v-for="(a, i) in offered"
        :id="optionId(i)"
        :key="a.code"
        :aria-selected="i === active"
        role="option"
        @pointerdown.prevent="() => choose(a)"
      >
        <b>{{ a.code }}</b><span>{{ a.name }}</span><small>{{ place(a) }}</small>
      </li>
    </ul>
    <p v-if="named !== undefined" class="named">{{ `${named.name} · ${place(named)}` }}</p>
    <p v-else-if="modelValue.trim() !== '' && airports.length > 0" class="named">{{ i18n.t("flight.unknownAirport") }}</p>
  </div>
</template>

<style scoped>
@import "../../../ui/styles/media.css";

/* not positioned itself: the airports it may mean float under the row it is in, as wide as it */
.airport {
  display: grid;
  gap: 6px;
  min-width: 0;
  > label {
    font-size: var(--font-sm);
    font-weight: 700;
    color: var(--muted);
  }
  > input {
    min-width: 0;
    min-height: 46px;
    padding: 10px 12px;
    font: inherit;
    font-size: var(--font-lg);
    color: var(--ink);
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: 10px;
    &::placeholder {
      color: var(--muted);
    }
    &:focus-visible {
      outline: 2px solid var(--ink);
      outline-offset: 2px;
    }
  }
  /* the airports it may mean, floating under the row (the parent places it: position: relative) */
  > ul {
    position: absolute;
    inset-block-start: calc(100% + 4px);
    inset-inline: 0;
    z-index: var(--z-menu);
    max-height: 300px;
    overflow-y: auto;
    margin: 0;
    padding: 4px;
    list-style: none;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 12px;
    box-shadow: var(--shadow-float);
    > li {
      display: grid;
      grid-template-columns: 3.2em 1fr;
      column-gap: 8px;
      padding: 8px 10px;
      border-radius: 8px;
      cursor: pointer;
      > b {
        grid-row: span 2;
        font-variant-numeric: tabular-nums;
      }
      > span {
        font-size: var(--font-sm);
        overflow-wrap: anywhere;
      }
      > small {
        font-size: var(--font-xs);
        color: var(--muted);
      }
      &[aria-selected="true"] {
        background: var(--wash);
      }
      @media (--can-hover) {
        &:hover {
          background: var(--wash);
        }
      }
    }
  }
  > .named {
    margin: 0;
    font-size: var(--font-xs);
    color: var(--muted);
    overflow-wrap: anywhere;
  }
}
</style>
