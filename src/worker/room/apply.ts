import * as v from "valibot";

import type { Result } from "../../contract";
import type { MemberId } from "../../contract/member";
import {
  IsoDateSchema,
  type IsoDate,
  type IsoInstant,
  type RejectReason,
  type WireMutation,
} from "../../contract/wire";

import { bookingColumns, faceColumns, readNote } from "./notes";
import { hasImage } from "./state";

/** A mutation the room wrote, as it wrote it, or why it did not */
export type Applied = Result<WireMutation, RejectReason>;

/** Writes the mutation as `by` at `now`; returns what was written, or why it was not */
export const apply = (sql: SqlStorage, m: WireMutation, by: MemberId, now: IsoInstant): Applied => {
  switch (m.type) {
    case "note:add": {
      // a deleted note keeps its id
      if (sql.exec("SELECT 1 FROM notes WHERE id = ?", m.note.id).toArray().length > 0)
        return { ok: false, reason: "duplicate id" };
      const note = { ...m.note, by, updatedAt: now };
      // every other kind is kept in a memo's columns, with nothing in those it does not have
      const memo =
        note.kind === "memo"
          ? note
          : {
              body: "",
              tags: [],
              mapsUrl: null,
              pin: null,
              schedule: null,
              budget: null,
              checked: false,
              // a sticker is its picture
              image: note.kind === "sticker" ? note.image : null,
              minutes: null,
              hours: null,
              link: null,
              booking: null,
              due: null,
              assignee: null,
            };
      // a card shows only a picture the room has
      if (memo.image !== null && !hasImage(sql, memo.image))
        return { ok: false, reason: "no such image" };
      sql.exec(
        `INSERT INTO notes (id, kind, title, color, x, y, rot, by, updated_at, body, tags, maps_url,
           pin_lat, pin_lng, sched_date, sched_time, sched_status, budget, checked, image, scale, minutes, hours,
           booking_state, booking_by, booking_code, booking_url, due, assignee, link)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        note.id,
        note.kind,
        ...faceColumns(note),
        note.x,
        note.y,
        note.rot,
        by,
        now,
        memo.body,
        JSON.stringify(memo.tags),
        memo.mapsUrl,
        memo.pin?.lat ?? null,
        memo.pin?.lng ?? null,
        memo.schedule?.date ?? null,
        memo.schedule?.time ?? null,
        memo.schedule?.status ?? null,
        memo.budget,
        memo.checked ? 1 : 0,
        memo.image,
        note.scale,
        memo.minutes,
        memo.hours,
        ...bookingColumns(memo.booking),
        memo.due,
        memo.assignee,
        memo.link,
      );
      return { ok: true, value: { type: "note:add", note } };
    }
    case "note:update": {
      const row = readNote(sql, m.id);
      if (row === undefined) return { ok: false, reason: "no such note" };
      if (row.kind !== "memo") return { ok: false, reason: "not a memo" };
      const p = m.patch;
      const has = <K extends keyof typeof p>(k: K) => Object.hasOwn(p, k);
      if (has("image") && typeof p.image === "string" && !hasImage(sql, p.image))
        return { ok: false, reason: "no such image" };
      sql.exec(
        `UPDATE notes SET
           title = ?, body = ?, tags = ?, color = ?, maps_url = ?, pin_lat = ?, pin_lng = ?,
           sched_date = ?, sched_time = ?, sched_status = ?, budget = ?, checked = ?, image = ?,
           minutes = ?, hours = ?, booking_state = ?, booking_by = ?, booking_code = ?,
           booking_url = ?, due = ?, assignee = ?, link = ?, x = ?, y = ?, rot = ?, updated_at = ?
         WHERE id = ?`,
        has("title") ? p.title : row.title,
        has("body") ? p.body : row.body,
        has("tags") ? JSON.stringify(p.tags) : row.tags,
        has("color") ? p.color : row.color,
        has("mapsUrl") ? p.mapsUrl : row.maps_url,
        has("pin") ? (p.pin?.lat ?? null) : row.pin_lat,
        has("pin") ? (p.pin?.lng ?? null) : row.pin_lng,
        has("schedule") ? (p.schedule?.date ?? null) : row.sched_date,
        has("schedule") ? (p.schedule?.time ?? null) : row.sched_time,
        has("schedule") ? (p.schedule?.status ?? null) : row.sched_status,
        has("budget") ? p.budget : row.budget,
        has("checked") ? (p.checked === true ? 1 : 0) : row.checked,
        has("image") ? (p.image ?? null) : row.image,
        has("minutes") ? (p.minutes ?? null) : row.minutes,
        has("hours") ? (p.hours ?? null) : row.hours,
        ...(has("booking")
          ? bookingColumns(p.booking ?? null)
          : [row.booking_state, row.booking_by, row.booking_code, row.booking_url]),
        has("due") ? (p.due ?? null) : row.due,
        has("assignee") ? (p.assignee ?? null) : row.assignee,
        has("link") ? (p.link ?? null) : row.link,
        has("x") ? p.x : row.x,
        has("y") ? p.y : row.y,
        has("rot") ? p.rot : row.rot,
        now,
        m.id,
      );
      return { ok: true, value: m };
    }
    case "note:recolor": {
      const row = readNote(sql, m.id);
      if (row === undefined) return { ok: false, reason: "no such note" };
      // a text box and a sticker have no paper to color
      if (row.kind !== "memo" && row.kind !== "suggestion")
        return { ok: false, reason: "not on paper" };
      sql.exec("UPDATE notes SET color = ?, updated_at = ? WHERE id = ?", m.color, now, m.id);
      return { ok: true, value: m };
    }
    case "text:edit": {
      const row = readNote(sql, m.id);
      if (row === undefined) return { ok: false, reason: "no such note" };
      if (row.kind !== "text") return { ok: false, reason: "not a text box" };
      // a text box's words are kept as its title (faceColumns)
      sql.exec("UPDATE notes SET title = ?, updated_at = ? WHERE id = ?", m.text, now, m.id);
      return { ok: true, value: m };
    }
    case "note:adopt": {
      const row = readNote(sql, m.id);
      if (row === undefined) return { ok: false, reason: "no such note" };
      if (row.kind !== "suggestion") return { ok: false, reason: "not a suggestion" };
      sql.exec(
        `UPDATE notes SET kind = 'memo', color = '#ffffff', body = '', tags = '[]', maps_url = NULL,
           pin_lat = NULL, pin_lng = NULL, sched_date = NULL, sched_time = NULL, sched_status = NULL,
           budget = NULL, checked = 0, minutes = NULL, hours = NULL, booking_state = NULL, booking_by = NULL,
           booking_code = NULL, booking_url = NULL, due = NULL, assignee = NULL, link = NULL, updated_at = ?
         WHERE id = ?`,
        now,
        m.id,
      );
      return { ok: true, value: m };
    }
    case "note:move": {
      const row = readNote(sql, m.id);
      if (row === undefined) return { ok: false, reason: "no such note" };
      // a move that does not say how the card is turned or how large keeps what it was
      sql.exec(
        "UPDATE notes SET x = ?, y = ?, rot = ?, scale = ?, updated_at = ? WHERE id = ?",
        m.x,
        m.y,
        m.rot ?? row.rot,
        m.scale ?? row.scale,
        now,
        m.id,
      );
      return { ok: true, value: m };
    }
    case "note:delete": {
      if (readNote(sql, m.id) === undefined) return { ok: false, reason: "no such note" };
      sql.exec("UPDATE notes SET deleted_at = ? WHERE id = ?", now, m.id);
      return { ok: true, value: m };
    }
    case "day:intro": {
      const n = sql.exec("UPDATE days SET intro = ? WHERE date = ?", m.intro, m.date).rowsWritten;
      return n === 0 ? { ok: false, reason: "no such day" } : { ok: true, value: m };
    }
    case "member:profile": {
      sql.exec("UPDATE members SET name = ?, color = ? WHERE id = ?", m.name, m.color, by);
      return { ok: true, value: m };
    }
    case "trip:dates": {
      // the trip moves by how far its first day moved, and its days are the new run of them:
      // each day keeps its place in the trip (day 2's intro is day 2's), each planned note
      // moves with the trip, and one that falls past the new last day loses its day
      const old = sql
        .exec<{ date: IsoDate; intro: string }>("SELECT date, intro FROM days ORDER BY position")
        .toArray();
      const was = old[0]?.date ?? m.first;
      const shift = (Date.parse(`${m.first}T00:00Z`) - Date.parse(`${was}T00:00Z`)) / 86_400_000;
      const dates = Array.from({ length: m.days }, (_, i) =>
        new Date(Date.parse(`${m.first}T00:00Z`) + i * 86_400_000).toISOString().slice(0, 10),
      );
      // a trip running past 9999-12-31 has days no date is written for ("+010000-01")
      if (!dates.every((date) => v.is(IsoDateSchema, date)))
        return { ok: false, reason: "no such day" };
      sql.exec("DELETE FROM days");
      dates.forEach((date, i) =>
        sql.exec(
          "INSERT INTO days (date, position, intro) VALUES (?, ?, ?)",
          date,
          i,
          old[i]?.intro ?? "",
        ),
      );
      if (shift !== 0)
        sql.exec(
          `UPDATE notes SET sched_date = date(sched_date, ? || ' days'), updated_at = ?
             WHERE sched_date IS NOT NULL`,
          (shift > 0 ? "+" : "") + String(shift),
          now,
        );
      sql.exec(
        `UPDATE notes SET sched_date = NULL, sched_time = NULL, sched_status = NULL, updated_at = ?
           WHERE sched_date IS NOT NULL AND (sched_date < ? OR sched_date > ?)`,
        now,
        dates[0],
        dates.at(-1),
      );
      return { ok: true, value: m };
    }
    case "trip:flight": {
      if (m.flight === null) sql.exec("DELETE FROM flights WHERE leg = ?", m.leg);
      else
        sql.exec(
          `INSERT INTO flights (leg, number, from_place, to_place, departs, arrives)
             VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT (leg) DO UPDATE SET number = excluded.number, from_place = excluded.from_place,
             to_place = excluded.to_place, departs = excluded.departs, arrives = excluded.arrives`,
          m.leg,
          m.flight.number,
          m.flight.from,
          m.flight.to,
          m.flight.departs,
          m.flight.arrives,
        );
      return { ok: true, value: m };
    }
    case "trip:stays": {
      sql.exec("DELETE FROM stays");
      m.stays.forEach((s, i) =>
        sql.exec(
          `INSERT INTO stays (position, name, check_in, nights, maps_url, pin_lat, pin_lng)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          i,
          s.name,
          s.checkIn,
          s.nights,
          s.mapsUrl,
          s.pin?.lat ?? null,
          s.pin?.lng ?? null,
        ),
      );
      return { ok: true, value: m };
    }
    case "trip:rename": {
      sql.exec("UPDATE trip SET name = ? WHERE id = 1", m.name);
      return { ok: true, value: m };
    }
  }
};
