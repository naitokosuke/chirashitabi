import { useMembers } from "@/features/members/useMembers";
import { useNotes } from "@/features/notes/useNotes";
import { useTrip } from "@/features/trip/useTrip";
import { useWorker } from "@/features/worker/useWorker";
import { mockMe, mockMembers } from "./members";
import { mockNotes } from "./notes";
import { mockTrip } from "./trip";
import { mockWorker } from "./worker";

/** Fill the stores the way a room would. Call after Pinia is installed. */
export function installMocks() {
  const members = useMembers();
  members.apply(mockMembers());
  members.me = mockMe;
  useTrip().apply(mockTrip());
  useNotes().apply(mockNotes());
  useWorker().api = mockWorker();
}
