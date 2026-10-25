import type { InjectionKey } from "vue";

import type { MemberId } from "../members/types";
import type { RoomId } from "../rooms/types";
import type { TripSnapshot } from "../trip/types";
import type { WorkerApi } from "../worker/types";

/**
 * The room this device is in, as everything shown inside it has it: which room, who this
 * device is there, its trip as the room shows it now, and the Worker's calls for it. Each is
 * read where it is used, never kept: the room can change under a view kept alive (KeepAlive),
 * and these follow it.
 */
export interface Here {
  readonly room: RoomId;
  readonly me: MemberId;
  /** In a room there is always its trip: from the room's snapshot, or as this device kept it */
  readonly trip: TripSnapshot;
  readonly api: WorkerApi;
}

/** What InRoom provides, and useInRoom reads */
export const HERE: InjectionKey<Here> = Symbol("here");
