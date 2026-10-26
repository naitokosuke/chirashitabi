<script setup lang="ts" vapor>
import { computed, onMounted, ref, shallowRef, useId } from "vue";

import { encode } from "uqr";

import {
  CtAvatar,
  CtButton,
  CtDisclosure,
  CtField,
  CtHeading,
  CtHint,
  CtInput,
  CtListItem,
  CtMessage,
  CtPanel,
} from "../../../ui/index";

import { useI18n } from "../../i18n/useI18n";

import type { Result } from "../../../contract";
import { KEPT_DAYS } from "../../../contract/room";
import { useInRoom } from "../sync/InRoom.vue";
import { useOffline } from "../sync/useOffline";

import type { MembersRefusal } from "./api";
import { REFUSALS } from "./refusals";
import { parseEmail, SEATS, type Email, type MemberId } from "./types";
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
const here = useInRoom();
const membership = useMembers();
const { members, me, invited } = membership;

const persons = computed(() => (members.value ?? []).filter((m) => m.kind === "person"));
const open = computed(() => persons.value.length + (invited.data.value?.length ?? 0) < SEATS);
/** The invitations asked again; a failure stays in their status, so it is not awaited */
function retry() {
  void invited.refetch();
}

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
/**
 * What did not go through, said once under the list: why the room refused it, or that it
 * failed (an invitation, or another change)
 */
type Failure =
  | { kind: "refused"; reason: MembersRefusal }
  | { kind: "failed"; what: "invite" | "other" };
const failed = shallowRef<Failure | null>(null);
const say = (f: Failure) =>
  f.kind === "refused"
    ? i18n.t(REFUSALS[f.reason])
    : i18n.t(f.what === "invite" ? "people.inviteFailed" : "people.failed");

const invite = membership.invite;
async function sendInvite() {
  if (email.value.trim() === "" || invite.isLoading.value) return;
  failed.value = null;
  // an address that is not one is said at once, as the room would refuse it
  const address = parseEmail(email.value);
  if (address === null) {
    failed.value = { kind: "failed", what: "invite" };
    return;
  }
  try {
    const sent = await invite.mutateAsync(address);
    if (sent.ok) email.value = "";
    else failed.value = { kind: "refused", reason: sent.reason };
  } catch {
    failed.value = { kind: "failed", what: "invite" };
  }
}

/**
 * One change of who is in, and whether it went through; a refusal or a failure is said, the
 * list is refreshed either way (useMembers). A refused change is not asked again. Its second
 * tap is not taken again while the room answers, so a double tap sends it once.
 */
async function run(change: () => Promise<Result<void, MembersRefusal>>) {
  failed.value = null;
  try {
    const done = await change();
    asking.value = null;
    if (done.ok) return true;
    failed.value = { kind: "refused", reason: done.reason };
    return false;
  } catch {
    failed.value = { kind: "failed", what: "other" };
    return false;
  }
}
const uninvite = (address: Email) => run(() => membership.uninvite.mutateAsync(address));
const remove = (member: MemberId) => run(() => membership.remove.mutateAsync(member));
// out of the trip: the room says so on the socket too; this is in case the socket was down when it did
async function leave() {
  if (await run(membership.leave.mutateAsync)) emit("out");
}
async function deleteTrip() {
  if (await run(membership.deleteRoom.mutateAsync)) emit("out");
}

const isMe = (m: MemberId) => here.me === m;

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
      <CtHeading :id="`${id}-title`">{{ i18n.t("people.title") }}</CtHeading>
      <CtMessage v-if="invited.status.value === 'error'" role="alert">
        {{ i18n.t("people.loadFailed") }}
        <CtButton @click="retry">{{ i18n.t("rooms.retry") }}</CtButton>
      </CtMessage>

      <CtPanel as="ul" pad="none">
        <CtListItem
          v-for="m in persons"
          :key="m.id"
          :notes="
            [
              m.role === 'owner' ? i18n.t('people.owner') : '',
              isMe(m.id) ? i18n.t('people.you') : '',
            ].filter((n) => n !== '')
          "
          :title="m.name"
        >
          <template #start><CtAvatar :color="m.color" :name="m.name" /></template>
          <!-- the owner may take the other person out; twice, the second time naming them -->
          <template v-if="me.role === 'owner' && m.role !== 'owner'" #end>
            <template v-if="asked({ kind: 'remove', member: m.id })">
              <CtButton
                danger
                variant="primary"
                :disabled="membership.remove.isLoading.value"
                @click="() => remove(m.id)"
              >
                {{ i18n.t("people.removeConfirm") }}
              </CtButton>
              <CtButton @click="cancel">{{ i18n.t("people.cancel") }}</CtButton>
            </template>
            <CtButton
              v-else
              danger
              :disabled="cut.offline"
              @click="() => ask({ kind: 'remove', member: m.id })"
            >
              {{ i18n.t("people.remove") }}
            </CtButton>
          </template>
        </CtListItem>
        <!-- a seat held for someone invited: a blank face until they answer (the owner's only) -->
        <CtListItem
          v-for="address in invited.data.value"
          :key="address"
          :notes="[i18n.t('people.pending')]"
          :title="address"
        >
          <template #start><CtAvatar pending /></template>
          <template #end>
            <CtButton
              :disabled="membership.uninvite.isLoading.value || cut.offline"
              @click="() => uninvite(address)"
            >
              {{ i18n.t("people.uninvite") }}
            </CtButton>
          </template>
        </CtListItem>
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
        <CtHint>{{ i18n.t(cut.offline ? "offline.unavailable" : "people.inviteHint") }}</CtHint>
        <CtDisclosure class="qr" :label="i18n.t('people.qr')">
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
          <CtHint>{{ i18n.t("people.qrHint") }}</CtHint>
        </CtDisclosure>
      </form>
      <CtHint v-else-if="me.role === 'owner'">
        {{ i18n.t("people.full", { count: SEATS }) }}
      </CtHint>

      <CtMessage v-if="failed !== null" role="alert">{{ say(failed) }}</CtMessage>

      <!-- the way out: the owner deletes the trip, a guest leaves it -->
      <div class="out">
        <template v-if="me.role === 'owner'">
          <template v-if="asked({ kind: 'delete' })">
            <CtButton
              danger
              variant="primary"
              :disabled="membership.deleteRoom.isLoading.value"
              @click="deleteTrip"
            >
              {{ i18n.t("people.deleteConfirm", { count: KEPT_DAYS }) }}
            </CtButton>
            <CtButton @click="cancel">{{ i18n.t("people.cancel") }}</CtButton>
          </template>
          <CtButton v-else danger :disabled="cut.offline" @click="() => ask({ kind: 'delete' })">
            {{ i18n.t("people.delete") }}
          </CtButton>
        </template>
        <template v-else>
          <template v-if="asked({ kind: 'leave' })">
            <CtButton
              danger
              variant="primary"
              :disabled="membership.leave.isLoading.value"
              @click="leave"
            >{{
              i18n.t("people.leaveConfirm")
            }}</CtButton>
            <CtButton @click="cancel">{{ i18n.t("people.cancel") }}</CtButton>
          </template>
          <CtButton v-else danger :disabled="cut.offline" @click="() => ask({ kind: 'leave' })">
            {{ i18n.t("people.leave") }}
          </CtButton>
        </template>
      </div>
    </template>
  </div>
</template>

<style scoped>
@import "/src/ui/styles/media.css";

.people {
  display: grid;
  gap: 12px;
}

.out {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
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
  > svg {
    display: block;
    width: min(240px, 100%);
    margin-block: 4px 8px;
    border-radius: 10px;
  }
}
</style>
