import type { CurrencyCode, HexColor } from "../../contract";
import { parseAirportCode } from "../../contract/airport";
import type { ImageId } from "../../contract/image";
import type { MemberId } from "../../contract/member";
import type { HttpUrl } from "../../contract/place";
import type {
  IsoDate,
  IsoDateTime,
  Leg,
  WireFlights,
  WireMember,
  WireStay,
  WireTrip,
} from "../../contract/wire";

/** Who is in the room, as the wire carries them: the creator first, then in the order they came */
export const readMembers = (sql: SqlStorage): WireMember[] =>
  sql
    .exec<{
      id: MemberId;
      kind: WireMember["kind"];
      creator: number;
      name: string;
      color: HexColor;
    }>("SELECT id, kind, creator, name, color FROM members ORDER BY creator DESC, rowid")
    .toArray()
    .map(({ id, kind, creator, name, color }) =>
      kind === "agent"
        ? { id, kind, name, color }
        : { id, kind, role: creator === 1 ? "owner" : "guest", name, color },
    );

/** The trip as the wire carries it: its name, currency, center, days, flights and stays */
export const readTrip = (sql: SqlStorage): WireTrip => {
  const t = sql
    .exec<{ name: string; currency: CurrencyCode; center_lat: number; center_lng: number }>(
      "SELECT name, currency, center_lat, center_lng FROM trip WHERE id = 1",
    )
    .one();
  const days = sql
    .exec<{ date: IsoDate; intro: string }>("SELECT date, intro FROM days ORDER BY position")
    .toArray();
  const flights: WireFlights = { out: null, back: null };
  for (const f of sql
    .exec<{
      leg: Leg;
      number: string;
      from_place: string;
      to_place: string;
      departs: IsoDateTime | null;
      arrives: IsoDateTime | null;
    }>("SELECT * FROM flights")
    .toArray()) {
    // only a flight between airports on the list (one kept from before stays out until set again)
    const [from, to] = [parseAirportCode(f.from_place), parseAirportCode(f.to_place)];
    if (from === null || to === null) continue;
    flights[f.leg] = {
      number: f.number,
      from,
      to,
      departs: f.departs,
      arrives: f.arrives,
    };
  }
  const stays = sql
    .exec<{
      name: string;
      check_in: IsoDate;
      nights: number;
      maps_url: HttpUrl | null;
      pin_lat: number | null;
      pin_lng: number | null;
    }>("SELECT * FROM stays ORDER BY position")
    .toArray()
    .map((s): WireStay => {
      const stay = { name: s.name, checkIn: s.check_in, nights: s.nights };
      const pin =
        s.pin_lat === null || s.pin_lng === null ? null : { lat: s.pin_lat, lng: s.pin_lng };
      // no link, no point: a pin is only ever the point a link names
      return s.maps_url === null
        ? { ...stay, mapsUrl: null, pin: null }
        : { ...stay, mapsUrl: s.maps_url, pin };
    });
  return {
    name: t.name,
    currency: t.currency,
    center: { lat: t.center_lat, lng: t.center_lng },
    days,
    flights,
    stays,
  };
};

/** Whether the room has a picture by that id on its list */
export const hasImage = (sql: SqlStorage, id: ImageId): boolean =>
  sql.exec("SELECT 1 FROM pictures WHERE id = ?", id).toArray().length > 0;
