<script setup lang="ts" vapor>
import type { RoomSummary } from "./types";

/**
 * A trip as a luggage tag on the list of trips, a link to pick up and go in: ink, level, a
 * punched hole at its start. Its name, its dates, where it stands (`when`), and who is on it:
 * a dot per member, round for a person and square for the agent, as on the desk's cards.
 * A trip that is over is drawn in white, receding behind the ones still to come.
 */
defineProps<{
  name: string;
  /** The name is the form's placeholder, not yet the trip's */
  unnamed?: boolean;
  dates: string;
  when: string;
  members: RoomSummary["members"];
  /** "12 notes", or nothing while there is no count to give */
  memos?: string;
  past?: boolean;
}>();
</script>

<template>
  <div class="tag" :data-past="past || undefined">
    <span aria-hidden="true" class="hole"></span>
    <div class="head">
      <p class="name" :data-unnamed="unnamed || undefined">{{ name }}</p>
      <p v-if="when" class="when">{{ when }}</p>
    </div>
    <p v-if="dates" class="dates">{{ dates }}</p>
    <div v-if="members.length || memos" class="foot">
      <ul v-if="members.length">
        <li v-for="m in members" :key="`${m.kind}:${m.name}:${m.color}`">
          <span :data-agent="m.kind === 'agent' || undefined" :style="`--who: ${m.color}`"></span>{{ m.name }}
        </li>
      </ul>
      <p v-if="memos">{{ memos }}</p>
    </div>
  </div>
</template>

<style scoped>
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
