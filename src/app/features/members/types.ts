import type { WireMember } from "../../../contract/wire";

// the room's member ids, e-mail addresses and seats, as the app takes them from the contract
export { EmailSchema, parseEmail, type Email } from "../../../contract";
export { MemberIdSchema, parseMemberId, type MemberId } from "../../../contract/member";
export { SEATS } from "../../../contract/room";

/** Anyone in the room, as the room sends them: nothing in a member needs reviving */
export type Member = WireMember;

/** An agent in the room (Claude): on the desk on equal terms, with no say in who is in it */
export type Agent = Extract<Member, { kind: "agent" }>;
