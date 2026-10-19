<script setup lang="ts" vapor>
import { computed, ref, watch } from "vue";

import { CtField, CtHint, CtInput } from "../../../ui/index";

import { useI18n } from "../../i18n/useI18n";

import { findAirport, suggestAirports, type Airport } from "../place/airports";
import { useAirports } from "../place/useAirports";

/**
 * An airport, typed: its code, its name or a Japanese name, with the airports it may mean
 * offered under it as it is typed; one chosen is written as its code. Under the field, the
 * airport it names, or that it names none on the list (and so the trip is not saved yet).
 */
const props = defineProps<{ id: string; label: string; modelValue: string; placeholder: string }>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const i18n = useI18n();
const airports = useAirports();

const open = ref(false);
/** The option the arrow keys are on, -1 for none */
const active = ref(-1);
/** The airports the text may mean, offered or not */
const offered = computed(() => suggestAirports(airports.value, props.modelValue));
/** The list is out: opened, with something in it */
const shown = computed(() => open.value && offered.value.length > 0);
const named = computed(() => findAirport(airports.value, props.modelValue));
const listId = computed(() => `${props.id}-airports`);
const optionId = (i: number) => `${props.id}-airport-${i}`;
/** The option the field points assistive technology at: only one that is out to be seen */
const activeId = computed(() =>
  shown.value && active.value >= 0 && active.value < offered.value.length
    ? optionId(active.value)
    : undefined,
);
// focus stays in the field, so nothing scrolls the list to the option walked to but this
watch(
  activeId,
  (id) => {
    if (id !== undefined) document.getElementById(id)?.scrollIntoView({ block: "nearest" });
  },
  { flush: "post" },
);

function close() {
  open.value = false;
  active.value = -1;
}
function typed(value: string | number) {
  emit("update:modelValue", String(value));
  open.value = true;
  active.value = -1;
}
function choose(a: Airport) {
  emit("update:modelValue", a.code);
  close();
}
/**
 * Down and up walk the airports offered (opening the list on the first or the last of them when
 * it is shut), Enter takes the one walked to, Esc shuts the list
 */
function onKey(e: KeyboardEvent) {
  const n = offered.value.length;
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    if (n === 0) return;
    e.preventDefault();
    const down = e.key === "ArrowDown";
    if (!shown.value) {
      open.value = true;
      active.value = down ? 0 : n - 1;
    } else if (down) active.value = (active.value + 1) % n;
    else active.value = active.value <= 0 ? n - 1 : active.value - 1;
  } else if (e.key === "Enter" && activeId.value !== undefined) {
    const a = offered.value[active.value];
    if (a !== undefined) {
      e.preventDefault();
      choose(a);
    }
  } else if (e.key === "Escape" && shown.value) {
    e.stopPropagation();
    close();
  }
}
const place = (a: Airport) => [a.city, a.country].filter((s) => s !== "").join(", ");
</script>

<template>
  <CtField class="airport" :for="id" :label>
    <CtInput
      :id
      autocapitalize="characters"
      autocomplete="off"
      :aria-activedescendant="activeId"
      :aria-controls="listId"
      :aria-expanded="shown"
      aria-autocomplete="list"
      :placeholder
      required
      role="combobox"
      :model-value
      @blur="close"
      @keydown="onKey"
      @update:model-value="typed"
    />
    <!-- always on the page, so the field's aria-controls names it; shown while it is out -->
    <ul v-show="shown" :id="listId" role="listbox">
      <!-- taken on click, once the finger is up (one that lands to scroll the list takes none);
           a pointer coming down keeps the focus in the field, which would shut the list -->
      <li
        v-for="(a, i) in offered"
        :id="optionId(i)"
        :key="a.code"
        :aria-selected="i === active"
        role="option"
        @pointerdown.prevent
        @click="() => choose(a)"
      >
        <b>{{ a.code }}</b><span>{{ a.name }}</span><small>{{ place(a) }}</small>
      </li>
    </ul>
    <CtHint v-if="named !== undefined">{{ `${named.name} · ${place(named)}` }}</CtHint>
    <CtHint v-else-if="modelValue.trim() !== '' && airports.length > 0">{{
      i18n.t("flight.unknownAirport")
    }}</CtHint>
  </CtField>
</template>

<style scoped>
@import "../../../ui/styles/media.css";

/* not positioned itself: the airports it may mean float under the row it is in, as wide as it */
.airport {
  /* packed at the top: beside a field whose airport's name takes two lines, the row is taller,
     and its spare height must not stretch this one's input */
  align-content: start;
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
}
</style>
