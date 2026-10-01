import type { Brand } from "../../shared/brand";
import type { HexColor } from "../../shared/color";

export type MemberId = Brand<string, "MemberId">;

/** Anyone in the room: a person or an agent, on equal terms */
export interface Member {
  id: MemberId;
  name: string;
  color: HexColor;
}
