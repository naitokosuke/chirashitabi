import type { Brand } from "../../shared/brand";
import type { HexColor } from "../../shared/color";

export type MemberId = Brand<string, "MemberId">;

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
