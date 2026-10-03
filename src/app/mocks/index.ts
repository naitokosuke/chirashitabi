import { useRoom } from "../features/sync/useRoom";
import { useWorker } from "../features/worker/useWorker";

import { mockMe, mockMembers } from "./members";
import { mockNotes } from "./notes";
import { mockTrip } from "./trip";
import { mockWorker } from "./worker";

/** Fill the stores the way a room would. Call after Pinia is installed. */
export function installMocks() {
  useWorker().api = mockWorker();
  useRoom().offline({ notes: mockNotes(), trip: mockTrip(), members: mockMembers() }, mockMe);
}
