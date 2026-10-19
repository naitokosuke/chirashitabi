<script setup lang="ts" vapor>
/**
 * A luggage tag for a trip, a link to pick up and go in: ink, level, a punched hole at its
 * start. Its name, its dates, where it stands (`when`), and who is on it: a dot per member,
 * round for a person and square for the agent, as on the desk's cards. A trip that is over
 * (`past`) is drawn in white, receding behind the ones still to come. Held in a link, it is
 * picked up a little under a pointer and pressed down under a finger.
 *
 * `variant="blank"` is the tag's outline, dashed, hole and all, waiting to be written on (the
 * way to a new trip): what it says goes in the slot. `variant="loading"` is where a tag will
 * hang while the list is on its way.
 */
const {
  variant = "trip",
  name = "",
  dates = "",
  when = "",
  members = [],
} = defineProps<{
  variant?: "trip" | "blank" | "loading";
  name?: string;
  /** The name is the form's placeholder, not yet the trip's */
  unnamed?: boolean;
  dates?: string;
  when?: string;
  members?: readonly { kind: "person" | "agent"; name: string; color: string }[];
  /** "12 notes", or nothing while there is no count to give */
  memos?: string;
  past?: boolean;
}>();
defineSlots<{ default?(): unknown }>();
</script>

<template>
  <div v-if="variant === 'loading'" aria-hidden="true" class="tag" data-variant="loading"></div>
  <div v-else-if="variant === 'blank'" class="tag" data-variant="blank">
    <span aria-hidden="true" class="hole"></span>
    <slot></slot>
  </div>
  <div v-else class="tag" :data-past="past || undefined">
    <span aria-hidden="true" class="hole"></span>
    <div class="head">
      <p class="name" :data-unnamed="unnamed || undefined">{{ name }}</p>
      <p v-if="when !== ''" class="when">{{ when }}</p>
    </div>
    <p v-if="dates !== ''" class="dates">{{ dates }}</p>
    <div v-if="members.length > 0 || memos !== undefined" class="foot">
      <ul v-if="members.length > 0">
        <li v-for="m in members" :key="`${m.kind}:${m.name}:${m.color}`">
          <span :data-agent="m.kind === 'agent' || undefined" :style="`--who: ${m.color}`"></span>{{ m.name }}
        </li>
      </ul>
      <p v-if="memos !== undefined">{{ memos }}</p>
    </div>
  </div>
</template>

<style scoped>
@import "../../styles/media.css";

.tag {
  --tag-ink: var(--on-ink);
  position: relative;
  display: grid;
  gap: 4px;
  padding: 16px 20px 16px 52px;
  border-radius: 12px 20px 20px 12px;
  background: var(--ink);
  color: var(--tag-ink);
  box-shadow: var(--shadow-paper);

  /* over: white, on a hairline, in ink, behind the trips still to come */
  &[data-past] {
    --tag-ink: var(--ink);
    background: var(--surface);
    box-shadow: inset 0 0 0 1px var(--line);
  }

  /* in a link: picked up, a little, as a tag is when reached for; pressed down when taken */
  a > & {
    transition:
      box-shadow var(--duration-swap) var(--ease-morph),
      translate var(--duration-swap) var(--ease-morph);
  }

  @media (--can-hover) {
    a:hover > & {
      box-shadow: var(--shadow-lift);
      translate: 0 -1px;
    }
  }

  a:active > & {
    translate: 0 1px;
    box-shadow: var(--shadow-tool);
  }

  /* the blank: the tag's outline, dashed, its hole too, its words in muted ink until reached for */
  &[data-variant="blank"] {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 72px;
    padding-block: 0;
    background: transparent;
    box-shadow: none;
    border: 1.5px dashed color-mix(in oklch, var(--ink) 28%, transparent);
    color: var(--muted);
    font-size: var(--font-base);
    font-weight: 700;
    transition:
      color var(--duration-swap) ease,
      border-color var(--duration-swap) ease,
      background-color var(--duration-swap) ease;

    > .hole {
      background: none;
      box-shadow: none;
      border: 1.5px dashed color-mix(in oklch, var(--ink) 28%, transparent);
    }

    @media (--can-hover) {
      a:hover > & {
        translate: none;
        box-shadow: none;
        color: var(--ink);
        border-color: color-mix(in oklch, var(--ink) 55%, transparent);
        background: var(--surface);
      }
    }

    a:active > & {
      translate: none;
      box-shadow: none;
    }
  }

  /* where a tag will hang, while the list is on its way */
  &[data-variant="loading"] {
    height: 104px;
    padding: 0;
    background: var(--wash);
    box-shadow: none;
  }
}

/* the punched hole, with the ring that keeps it from tearing */
.hole {
  position: absolute;
  inset-inline-start: 18px;
  inset-block-start: 50%;
  translate: 0 -50%;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--bg);
  box-shadow:
    inset 0 1px 2px rgb(0 0 0 / 0.35),
    0 0 0 3px color-mix(in oklch, var(--tag-ink) 22%, transparent);
}

.head {
  display: flex;
  align-items: baseline;
  gap: 12px;
  min-width: 0;
}

p {
  margin: 0;
}

.name {
  flex: 1;
  min-width: 0;
  font-size: var(--font-4xl);
  font-weight: 700;
  line-height: 1.25;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-wrap: balance;

  &[data-unnamed] {
    opacity: 0.45;
  }
}

/* how soon, at the far end, where the eye lands after the name */
.when {
  flex-shrink: 0;
  font-size: var(--font-sm);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.dates {
  font-size: var(--font-sm);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  opacity: 0.7;
}

.foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-block-start: 8px;
  font-size: var(--font-xs);
  opacity: 0.8;

  > ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    min-width: 0;

    > li {
      display: inline-flex;
      align-items: center;
      gap: 6px;

      /* whose hand: round for a person, square for the agent */
      > span {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--who);
        box-shadow: 0 0 0 1.5px color-mix(in oklch, var(--tag-ink) 70%, transparent);

        &[data-agent] {
          border-radius: 1px;
        }
      }
    }
  }

  > p {
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
  }
}
</style>
