import * as v from "valibot";

import type { CurrencyCode, HexColor } from "../../contract";
import { parseAirportCode } from "../../contract/airport";
import type { ImageId } from "../../contract/image";
import type { MemberId } from "../../contract/member";
import {
  WireFlightSchema,
  WireMemberSchema,
  WireStaySchema,
  type IsoDate,
  type Leg,
  type WireFlights,
  type WireMember,
  type WireStay,
  type WireTrip,
} from "../../contract/wire";

/**
 * Who is in the room, as the wire carries them: the creator first, then in the order they
 * came. One the contract does not read is left out and logged, rather than keep everyone from
 * opening the room.
 */
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
    .flatMap(({ id, kind, creator, name, color }) => {
      const read = v.safeParse(
        WireMemberSchema,
        kind === "agent"
          ? { id, kind, name, color }
          : { id, kind, role: creator === 1 ? "owner" : "guest", name, color },
      );
      if (read.success) return [read.output];
      console.warn("room: a member who does not read is left out", { id, kind });
      return [];
    });

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
      departs: string | null;
      arrives: string | null;
    }>("SELECT * FROM flights")
    .toArray()) {
    // only a flight between airports on the list (one kept from before stays out until set again)
    const [from, to] = [parseAirportCode(f.from_place), parseAirportCode(f.to_place)];
    if (from === null || to === null) continue;
    // and one the contract reads: a row it does not stays out and is logged, the trip still read
    const read = v.safeParse(WireFlightSchema, {
      number: f.number,
      from,
      to,
      departs: f.departs,
      arrives: f.arrives,
    });
    if (read.success) flights[f.leg] = read.output;
    else console.warn("room: a flight that does not read is left out", { leg: f.leg });
  }
  const stays = sql
    .exec<{
      name: string;
      position: number;
      check_in: string;
      nights: number;
      maps_url: string | null;
      pin_lat: number | null;
      pin_lng: number | null;
    }>("SELECT * FROM stays ORDER BY position")
    .toArray()
    // the contract's own reading (no link, no point); a stay it does not read is left out and logged
    .flatMap((s): WireStay[] => {
      const read = v.safeParse(WireStaySchema, {
        name: s.name,
        checkIn: s.check_in,
        nights: s.nights,
        mapsUrl: s.maps_url,
        pin: s.pin_lat === null || s.pin_lng === null ? null : { lat: s.pin_lat, lng: s.pin_lng },
      });
      if (read.success) return [read.output];
      console.warn("room: a stay that does not read is left out", { position: s.position });
      return [];
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
