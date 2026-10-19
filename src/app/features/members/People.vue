<script setup lang="ts" vapor>
import { computed, onMounted, ref, shallowRef, useId } from "vue";

import { encode } from "uqr";

import { CtAvatar, CtButton, CtField, CtInput, CtPanel } from "../../../ui/index";

import { useI18n } from "../../i18n/useI18n";

import { KEPT_DAYS } from "../rooms/api";
import { useOffline } from "../sync/useOffline";
import { useSync } from "../sync/useSync";

import { parseEmail, SEATS, type Email, type MemberId, type Person } from "./types";
import { useMembers } from "./useMembers";

/**
 * Who is on the trip, and the way in and out of it, at the foot of the trip's home. The owner
 * (who made the trip) invites by e-mail, takes an invitation back, removes the other person and
 * deletes the trip; a guest may leave. Anything that takes someone out asks twice. Once this
 * person is out of it (left, or the trip deleted), `out` says so. Beside the invitation, a QR
 * code of the app's address opens it on the other person's phone; it carries nothing else, since
 * the invitation is tied to their e-mail.
 */
const emit = defineEmits<{ out: [] }>();
const i18n = useI18n();
/** Cut off: what needs the Worker is not offered */
const cut = useOffline();
const id = useId();
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
  if (email.value.trim() === "" || invite.isLoading.value) return;
  failed.value = null;
  // an address that is not one is said at once, as the room would refuse it
  const address = parseEmail(email.value);
  if (address === null) {
    failed.value = "invite";
    return;
  }
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
const uninvite = (address: Email) => run(() => membership.uninvite.mutateAsync(address));
const remove = (member: MemberId) => run(() => membership.remove.mutateAsync(member));
// the room says so on the socket too; this is in case the socket was down when it did
const out = () => emit("out");
const leave = () => run(() => membership.leave.mutateAsync(), out);
const deleteTrip = () => run(() => membership.deleteRoom.mutateAsync(), out);

const isMe = (m: MemberId) => sync.me === m;

// one square per dark module, inside the quiet zone of four the QR spec asks for; drawn once
// mounted, in the page whose address it is
const qr = shallowRef<{ size: number; path: string } | null>(null);
onMounted(() => {
  const { size, data } = encode(location.origin, { border: 4 });
  const path = data
    .flatMap((row, y) => row.map((dark, x) => (dark ? `M${x} ${y}h1v1h-1z` : "")))
    .join("");
  qr.value = { size, path };
});
</script>

<template>
  <!-- a div: the home's own scoped styles are on every section it holds -->
  <!-- once the room has said who this device is in it -->
  <div v-show="me !== undefined" class="people" role="group" :aria-labelledby="`${id}-title`">
    <template v-if="me !== undefined">
      <h2 :id="`${id}-title`">{{ i18n.t("people.title") }}</h2>
      <p v-if="invited.status.value === 'error'" class="note" role="alert">
        {{ i18n.t("people.loadFailed") }}
        <CtButton @click="() => invited.refetch()">{{ i18n.t("rooms.retry") }}</CtButton>
      </p>

      <CtPanel as="ul" class="members" pad="none">
        <li v-for="m in persons" :key="m.id">
          <CtAvatar :color="m.color" :name="m.name" />
          <span class="who">
            <b>{{ m.name }}</b>
            <small v-if="m.role === 'owner'">{{ i18n.t("people.owner") }}</small>
            <small v-if="isMe(m.id)">{{ i18n.t("people.you") }}</small>
          </span>
          <!-- the owner may take the other person out; twice, the second time naming them -->
          <span v-if="me.role === 'owner' && m.role !== 'owner'" class="acts">
            <template v-if="asked({ kind: 'remove', member: m.id })">
              <CtButton variant="primary" @click="() => remove(m.id)">
                {{ i18n.t("people.removeConfirm") }}
              </CtButton>
              <CtButton @click="cancel">{{ i18n.t("people.cancel") }}</CtButton>
            </template>
            <CtButton
              v-else
              :disabled="cut.offline"
              @click="() => ask({ kind: 'remove', member: m.id })"
            >
              {{ i18n.t("people.remove") }}
            </CtButton>
          </span>
        </li>
        <!-- a seat held for someone invited: a blank face until they answer (the owner's only) -->
        <li v-for="address in invited.data.value" :key="address">
          <CtAvatar pending />
          <span class="who">
            <b>{{ address }}</b>
            <small>{{ i18n.t("people.pending") }}</small>
          </span>
          <span class="acts">
            <CtButton :disabled="cut.offline" @click="() => uninvite(address)">{{
              i18n.t("people.uninvite")
            }}</CtButton>
          </span>
        </li>
      </CtPanel>

      <form v-if="me.role === 'owner' && open" class="invite" @submit.prevent="sendInvite">
        <CtField :for="`${id}-email`" :label="i18n.t('people.email')">
          <div class="line">
            <CtInput
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
            <CtButton
              size="lg"
              type="submit"
              variant="primary"
              :disabled="invite.isLoading.value || email.trim() === '' || cut.offline"
            >
              {{ i18n.t(invite.isLoading.value ? "people.inviting" : "people.invite") }}
            </CtButton>
          </div>
        </CtField>
        <p class="hint">{{ i18n.t(cut.offline ? "offline.unavailable" : "people.inviteHint") }}</p>
        <details class="qr">
          <summary>{{ i18n.t("people.qr") }}</summary>
          <svg
            v-if="qr !== null"
            role="img"
            :aria-label="i18n.t('people.qrLabel')"
            :viewBox="`0 0 ${qr.size} ${qr.size}`"
            shape-rendering="crispEdges"
          >
            <rect fill="#fff" :width="qr.size" :height="qr.size" />
            <path fill="#000" :d="qr.path" />
          </svg>
          <p class="hint">{{ i18n.t("people.qrHint") }}</p>
        </details>
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
            <CtButton variant="primary" @click="deleteTrip">
              {{ i18n.t("people.deleteConfirm", { count: KEPT_DAYS }) }}
            </CtButton>
            <CtButton @click="cancel">{{ i18n.t("people.cancel") }}</CtButton>
          </template>
          <CtButton v-else :disabled="cut.offline" @click="() => ask({ kind: 'delete' })">
            {{ i18n.t("people.delete") }}
          </CtButton>
        </template>
        <template v-else>
          <template v-if="asked({ kind: 'leave' })">
            <CtButton variant="primary" @click="leave">{{
              i18n.t("people.leaveConfirm")
            }}</CtButton>
            <CtButton @click="cancel">{{ i18n.t("people.cancel") }}</CtButton>
          </template>
          <CtButton v-else :disabled="cut.offline" @click="() => ask({ kind: 'leave' })">
            {{ i18n.t("people.leave") }}
          </CtButton>
        </template>
      </div>
    </template>
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

.members {
  display: grid;

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

.invite {
  display: grid;
  gap: 6px;

  /* the address and the button that sends it, on one line */
  .line {
    display: flex;
    gap: 8px;

    > input {
      flex: 1;
    }
  }
}

/* black on white whatever the theme: what a camera reads best */
.qr {
  > summary {
    width: fit-content;
    min-height: var(--tap);
    display: flex;
    align-items: center;
    font-size: var(--font-sm);
    font-weight: 700;
    color: var(--muted);
    cursor: pointer;
  }

  > svg {
    display: block;
    width: min(240px, 100%);
    margin-block: 4px 8px;
    border-radius: 10px;
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
