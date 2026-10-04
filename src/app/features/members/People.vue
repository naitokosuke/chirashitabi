<script setup lang="ts" vapor>
import { computed, ref, shallowRef, useId } from "vue";

import { useRouter } from "vue-router";

import { useI18n } from "../../i18n/useI18n";

import { KEPT_DAYS } from "../rooms/api";
import { useSync } from "../sync/useSync";

import { SEATS, type MemberId, type Person } from "./types";
import { useMembers } from "./useMembers";

/**
 * Who is on the trip, and the way in and out of it, at the foot of the trip's home. The owner
 * (who made the trip) invites by e-mail, takes an invitation back, removes the other person and
 * deletes the trip; a guest may leave. Anything that takes someone out asks twice.
 */
const i18n = useI18n();
const id = useId();
const router = useRouter();
const sync = useSync();
const membership = useMembers();
const { members, me, invited } = membership;

const persons = computed(() =>
  (members.value ?? []).filter((m): m is Person => m.kind === "person"),
);
const open = computed(() => persons.value.length + (invited.data.value?.length ?? 0) < SEATS);

/** What is waiting for a second tap: taking someone out, leaving, or deleting */
type Asking = { kind: "remove"; member: MemberId } | { kind: "leave" } | { kind: "delete" };
const asking = shallowRef<Asking | null>(null);
const asked = (a: Asking) => {
  const now = asking.value;
  if (now === null || now.kind !== a.kind) return false;
  return a.kind !== "remove" || (now.kind === "remove" && now.member === a.member);
};
const ask = (a: Asking) => {
  failed.value = null;
  asking.value = a;
};
const cancel = () => (asking.value = null);

const email = ref("");
/** What did not go through, said once under the list */
const failed = ref<"invite" | "other" | null>(null);

const invite = membership.invite;
async function sendInvite() {
  const address = email.value.trim();
  if (address === "" || invite.isLoading.value) return;
  failed.value = null;
  try {
    await invite.mutateAsync(address);
    email.value = "";
  } catch {
    failed.value = "invite";
  }
}

/** One change of who is in; a failure is said, the list is refreshed either way (useMembers) */
async function run(change: () => Promise<unknown>, then?: () => void) {
  failed.value = null;
  try {
    await change();
    asking.value = null;
    then?.();
  } catch {
    failed.value = "other";
  }
}
const uninvite = (address: string) => run(() => membership.uninvite.mutateAsync(address));
const remove = (member: MemberId) => run(() => membership.remove.mutateAsync(member));
// the room says so on the socket and the room's page goes back to the trips
// (pages/rooms/[roomId].vue); this is in case the socket was down when it did
const toTrips = () => void router.replace("/");
const leave = () => run(() => membership.leave.mutateAsync(), toTrips);
const deleteTrip = () => run(() => membership.deleteRoom.mutateAsync(), toTrips);

const isMe = (m: MemberId) => sync.me === m;
</script>

<template>
  <!-- a div: the home's own scoped styles are on every section it holds -->
  <!-- once the room has said who this device is in it -->
  <div v-if="me" class="people" role="group" :aria-labelledby="`${id}-title`">
    <h2 :id="`${id}-title`">{{ i18n.t("people.title") }}</h2>
    <p v-if="invited.status.value === 'error'" class="note" role="alert">
      {{ i18n.t("people.loadFailed") }}
      <button type="button" @click="() => invited.refetch()">{{ i18n.t("rooms.retry") }}</button>
    </p>

    <ul>
      <li v-for="m in persons" :key="m.id" :style="`--who: ${m.color}`">
        <span aria-hidden="true" class="face">{{ m.name.slice(0, 1) }}</span>
        <span class="who">
          <b>{{ m.name }}</b>
          <small v-if="m.role === 'owner'">{{ i18n.t("people.owner") }}</small>
          <small v-if="isMe(m.id)">{{ i18n.t("people.you") }}</small>
        </span>
        <!-- the owner may take the other person out; twice, the second time naming them -->
        <span v-if="me.role === 'owner' && m.role !== 'owner'" class="acts">
          <template v-if="asked({ kind: 'remove', member: m.id })">
            <button class="danger" type="button" @click="() => remove(m.id)">
              {{ i18n.t("people.removeConfirm") }}
            </button>
            <button type="button" @click="cancel">{{ i18n.t("people.cancel") }}</button>
          </template>
          <button v-else type="button" @click="() => ask({ kind: 'remove', member: m.id })">
            {{ i18n.t("people.remove") }}
          </button>
        </span>
      </li>
      <!-- a seat held for someone invited: a blank face until they answer (the owner's only) -->
      <li v-for="address in invited.data.value" :key="address" class="pending">
        <span aria-hidden="true" class="face"></span>
        <span class="who">
          <b>{{ address }}</b>
          <small>{{ i18n.t("people.pending") }}</small>
        </span>
        <span class="acts">
          <button type="button" @click="() => uninvite(address)">{{ i18n.t("people.uninvite") }}</button>
        </span>
      </li>
    </ul>

    <form v-if="me.role === 'owner' && open" class="invite" @submit.prevent="sendInvite">
      <label :for="`${id}-email`">{{ i18n.t("people.email") }}</label>
      <div>
        <input
          :id="`${id}-email`"
          v-model="email"
          autocapitalize="off"
          autocomplete="off"
          enterkeyhint="send"
          inputmode="email"
          maxlength="254"
          required
          spellcheck="false"
          type="email"
        />
        <button
          class="primary"
          type="submit"
          :disabled="invite.isLoading.value || email.trim() === ''"
        >
          {{ i18n.t(invite.isLoading.value ? "people.inviting" : "people.invite") }}
        </button>
      </div>
      <p class="hint">{{ i18n.t("people.inviteHint") }}</p>
    </form>
    <p v-else-if="me.role === 'owner'" class="hint">
      {{ i18n.t("people.full", { count: SEATS }) }}
    </p>

    <p v-if="failed !== null" class="note" role="alert">
      {{ i18n.t(failed === "invite" ? "people.inviteFailed" : "people.failed") }}
    </p>

    <!-- the way out: the owner deletes the trip, a guest leaves it -->
    <div class="out">
      <template v-if="me.role === 'owner'">
        <template v-if="asked({ kind: 'delete' })">
          <button class="danger" type="button" @click="deleteTrip">
            {{ i18n.t("people.deleteConfirm", { count: KEPT_DAYS }) }}
          </button>
          <button type="button" @click="cancel">{{ i18n.t("people.cancel") }}</button>
        </template>
        <button v-else type="button" @click="() => ask({ kind: 'delete' })">
          {{ i18n.t("people.delete") }}
        </button>
      </template>
      <template v-else>
        <template v-if="asked({ kind: 'leave' })">
          <button class="danger" type="button" @click="leave">{{ i18n.t("people.leaveConfirm") }}</button>
          <button type="button" @click="cancel">{{ i18n.t("people.cancel") }}</button>
        </template>
        <button v-else type="button" @click="() => ask({ kind: 'leave' })">
          {{ i18n.t("people.leave") }}
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped>
@import "../../../ui/styles/media.css";

.people {
  display: grid;
  gap: 12px;
}

h2 {
  margin: 0;
  font-size: var(--font-2xl);
  font-weight: 700;
  line-height: 1.35;
}

ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  border-radius: 14px;
  background: var(--surface);
  box-shadow: inset 0 0 0 1px var(--line);

  > li {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 60px;
    padding: 10px 14px;

    & + li {
      border-block-start: 1px solid var(--line);
    }
  }
}

/* the member's own color, deepened enough to carry white, as at the top of the page */
.face {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: oklch(from var(--who) min(l, 0.52) c h);
  color: var(--on-tint);
  font-weight: 700;

  /* nobody yet: the outline of a face */
  .pending > & {
    background: transparent;
    border: 1.5px dashed color-mix(in oklch, var(--ink) 35%, transparent);
  }
}

.who {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 2px 8px;

  > b {
    min-width: 0;
    overflow-wrap: anywhere;
    font-size: var(--font-md);
  }

  > small {
    font-size: var(--font-xs);
    font-weight: 700;
    color: var(--muted);
  }
}

.acts,
.out {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}

.out {
  justify-content: flex-start;
  margin-block-start: 8px;
}

button {
  min-height: var(--tap);
  padding: 0 14px;
  border-radius: 999px;
  border: 0;
  background: var(--wash);
  color: var(--ink);
  font: inherit;
  font-size: var(--font-sm);
  font-weight: 700;

  &:focus-visible {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
  }

  &:disabled {
    opacity: 0.35;
  }

  @media (--can-hover) {
    &:not(:disabled):hover {
      background: color-mix(in oklch, var(--ink) 12%, var(--bg));
    }
  }
}

/* the second tap of something that takes someone out: it says what it will do, in ink */
button.danger,
button.primary {
  background: var(--ink);
  color: var(--on-ink);

  @media (--can-hover) {
    &:not(:disabled):hover {
      background: var(--ink);
      box-shadow: var(--shadow-float);
    }
  }
}

.invite {
  display: grid;
  gap: 6px;

  > label {
    font-size: var(--font-sm);
    font-weight: 700;
    color: var(--muted);
  }

  > div {
    display: flex;
    gap: 8px;

    > input {
      flex: 1;
      min-width: 0;
      min-height: 46px;
      padding: 10px 12px;
      font: inherit;
      font-size: var(--font-lg);
      color: var(--ink);
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 10px;

      &:focus-visible {
        outline: 2px solid var(--ink);
        outline-offset: 2px;
      }
    }

    > button {
      min-height: 46px;
    }
  }
}

.hint {
  margin: 0;
  font-size: var(--font-xs);
  line-height: 1.6;
  color: var(--muted);
  text-wrap: pretty;
}

.note {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 12px;
  margin: 0;
  font-size: var(--font-sm);
  color: var(--ink);
}
</style>
