/** A room as the list of a person's trips shows it */
export interface RoomSummary {
  id: string;
  name: string;
}

/** What a room is created with; the Worker checks it again */
export interface NewRoom {
  trip: { name: string; days: string[]; currency: string; center: { lat: number; lng: number } };
  me: { name: string; color: string };
}
