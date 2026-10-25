import type { MessageId } from "../../i18n/types";

import type { MembersRefusal } from "./api";

/** What the person is told when the room refuses a change of who is in, for each refusal */
export const REFUSALS: Record<MembersRefusal, MessageId> = {
  "no seat": "people.noSeat",
  "already in": "people.alreadyIn",
  "already invited": "people.alreadyInvited",
  "not the owner": "people.notOwner",
  "not theirs": "people.notOwner",
  "the owner": "people.isOwner",
  "not in": "people.notIn",
};
