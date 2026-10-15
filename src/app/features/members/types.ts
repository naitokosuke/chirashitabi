import type { Brand } from "../../shared/brand";
import type { HexColor } from "../../shared/color";

export type MemberId = Brand<string, "MemberId">;

/** A member's id, as a room mints it: a UUID for a person, `agent:<name>` for its agent */
export const isMemberId = (v: unknown): v is MemberId =>
  typeof v === "string" &&
  /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|agent:[a-z]+)$/.test(v);

/** An e-mail address as a person logs in with it: trimmed and lowercased, one key per person */
export type Email = Brand<string, "Email">;

/** How many people a room holds; an invitation holds a seat until it is answered */
export const SEATS = 2;

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
