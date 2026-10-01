import { useNotes } from "@/features/notes/store";
import { useTrip } from "@/features/trip/store";
import { useWorker } from "@/features/worker/store";
import { mockNotes } from "./notes";
import { mockTrip } from "./trip";
import { mockWorker } from "./worker";

/** Fill the stores the way a room would. Call after Pinia is installed. */
export function installMocks() {
  useTrip().apply(mockTrip());
  useNotes().apply(mockNotes());
  useWorker().api = mockWorker();
}
