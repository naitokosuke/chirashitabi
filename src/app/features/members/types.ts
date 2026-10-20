import type { HexColor } from "../../shared/color";

import type { MemberId } from "../../../contract/member";

// the room's member ids, e-mail addresses and seats, as the app takes them from the contract
export { EmailSchema, parseEmail, type Email } from "../../../contract";
export { isMemberId, MemberIdSchema, type MemberId } from "../../../contract/member";
export { SEATS } from "../../../contract/room";

export type Role = "owner" | "guest";

/** A person in the room; only a person can be invited, removed or leave */
export interface Person {
  id: MemberId;
  kind: "person";
  role: Role;
  name: string;
  color: HexColor;
}

/** An agent in the room (Claude): on the desk on equal terms, with no say in who is in it */
export interface Agent {
  id: MemberId;
  kind: "agent";
  name: string;
  color: HexColor;
}

/** Anyone in the room */
export type Member = Person | Agent;
