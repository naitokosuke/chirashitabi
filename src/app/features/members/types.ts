import type { Brand } from "../../shared/brand";
import type { HexColor } from "../../shared/color";

export type MemberId = Brand<string, "MemberId">;

/**
 * Who may do what in a room, as the Worker answers it: the owner (who made the room) invites,
 * removes and deletes. `invited` is the e-mails waiting to answer, shown to the owner only;
 * `seats` is how many people the room holds. `owner` is null when the answer did not say.
 */
export interface People {
  owner: MemberId | null;
  invited: string[];
  seats: number;
}

/**
 * Anyone in the room: a person or an agent, on equal terms on the desk. Only a person can be
 * invited, removed or leave.
 */
export interface Member {
  id: MemberId;
  kind: "person" | "agent";
  name: string;
  color: HexColor;
}
