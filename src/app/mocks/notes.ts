import { Temporal } from "temporal-polyfill-lite";

import * as v from "valibot";

import { makeMemo } from "../features/notes/fixtures";
import { NoteIdSchema } from "../features/notes/id";
import {
  ARRIVAL_TAG,
  PACKING_TAG,
  TagSchema,
  TODO_TAG,
  type Memo,
  type Note,
  type NoteStatus,
  type Schedule,
  type Suggestion,
} from "../features/notes/types";
import { HttpUrlSchema } from "../features/place/google-maps";

import { CLAUDE, KEN, YUKI } from "./members";

/** On `date`, at `time` ("" for anytime) */
const on = (date: string, time: string, status: NoteStatus): Schedule => ({
  date: Temporal.PlainDate.from(date),
  time: time === "" ? null : Temporal.PlainTime.from(time),
  status,
});
const pin = (lat: number, lng: number) => ({ lat, lng });
const tags = (...names: string[]) => v.parse(v.array(TagSchema), names);
const link = (url: string) => v.parse(HttpUrlSchema, url);

let i = 0;
const card = (): Pick<Memo, "id" | "color" | "rot" | "scale" | "by" | "updatedAt"> => ({
  id: v.parse(NoteIdSchema, `s${i++}`),
  color: "#fff1b8",
  rot: 0,
  scale: 1,
  by: YUKI,
  updatedAt: Temporal.Now.instant(),
});
const n = (p: Partial<Memo> & Pick<Memo, "title" | "x" | "y">): Memo => {
  const c = card();
  return makeMemo(c.id, { ...c, ...p });
};
const suggest = (p: Partial<Suggestion> & Pick<Suggestion, "title" | "x" | "y">): Suggestion => ({
  ...card(),
  kind: "suggestion",
  ...p,
});

export const mockNotes = (): Note[] => [
  n({
    title: "Din Tai Fung xiaolongbao",
    pin: pin(25.0335, 121.5301),
    body: "The main shop has a queue; the Taipei 101 branch is fine https://www.dintaifung.com.tw/",
    tags: tags("Food"),
    x: 40,
    y: 40,
    rot: -2,
    by: KEN,
    schedule: on("2026-11-03", "12:30", "fixed"),
    minutes: 60,
    hours: "Mo-Fr 11:00-20:30; Sa,Su 10:30-21:00",
    booking: { state: "booked", code: "DTF-2814", url: null },
    budget: 700,
    mapsUrl: link("https://maps.google.com/?q=Din+Tai+Fung"),
  }),
  n({
    title: "Jiufen at dusk",
    pin: pin(25.1094, 121.8453),
    body: "Aim for when the lanterns come on. The bus back gets crowded",
    tags: tags("Jiufen", "Want to go"),
    color: "#ffd9de",
    x: 230,
    y: 52,
    rot: 1.5,
    schedule: on("2026-11-03", "16:00", "fixed"),
    minutes: 240,
    mapsUrl: link("https://maps.google.com/?q=Jiufen"),
  }),
  n({
    title: "Taihu Brewing",
    pin: pin(25.0378, 121.5629),
    body: "Xinyi. Stop by after the night market",
    hours: "We-Su 17:00-24:00",
    tags: tags("Beer"),
    x: 60,
    y: 210,
    rot: 1,
    schedule: on("2026-11-03", "20:30", "fixed"),
    budget: 400,
  }),
  n({
    title: "Shilin Night Market",
    pin: pin(25.0881, 121.5244),
    body: "Pepper buns and sausage-in-sausage",
    tags: tags("Food", "Want to go"),
    color: "#ffffff",
    x: 240,
    y: 190,
    rot: -1,
    by: KEN,
    schedule: on("2026-11-03", "", "idea"),
    budget: 500,
  }),
  n({
    title: "Dried goods on Dihua Street",
    pin: pin(25.0557, 121.51),
    body: "Mullet roe, tea",
    tags: tags("Shopping"),
    color: "#d8f0e6",
    x: 50,
    y: 360,
    rot: 2,
    schedule: on("2026-11-04", "10:00", "fixed"),
    budget: 1500,
  }),
  n({
    title: "Taipei 101 observatory",
    pin: pin(25.0339, 121.5645),
    booking: { state: "needed", by: Temporal.PlainDate.from("2026-10-30") },
    body: "Depends on the weather",
    tags: tags("Want to go"),
    color: "#ffffff",
    x: 240,
    y: 370,
    rot: -2.5,
    by: KEN,
    schedule: on("2026-11-04", "", "idea"),
    budget: 600,
  }),
  n({
    title: "Smoothie House shaved ice",
    pin: pin(25.033, 121.5297),
    body: "Yongkang Street. One bowl to share",
    tags: tags("Sweets"),
    x: 250,
    y: 510,
    rot: 0.5,
  }),
  suggest({
    title:
      "On 11/4, Dihua Street → Taipei 101 is a single MRT line. Shaved ice on Yongkang Street after 101",
    x: 30,
    y: 500,
    rot: -1,
    by: CLAUDE,
  }),
  suggest({
    title: "士林夜市で食べ歩き（大雞排・生煎包）",
    x: 30,
    y: 720,
    rot: 1.5,
    by: CLAUDE,
  }),
  n({
    title: "迪化街の乾物屋で烏魚子を買って帰る、できれば小分けのやつ",
    body: "https://example.com/dihua-street-guide を読んだ。日曜は閉まる店が多い",
    tags: tags("Shopping"),
    color: "#ffffff",
    x: 480,
    y: 620,
    rot: -1,
    by: KEN,
    schedule: on("2026-11-04", "11:00", "idea"),
  }),
  n({
    title: "Le Blé d'Or honey lager",
    pin: pin(25.0415, 121.546),
    body: "Supposedly sweet. One glass is enough",
    tags: tags("Beer"),
    x: 480,
    y: 60,
    rot: 1,
    by: KEN,
  }),
  n({
    title: "Stomach medicine and band-aids",
    tags: [PACKING_TAG],
    color: "#d8f0e6",
    x: 500,
    y: 240,
    rot: -1,
  }),
  n({
    title: "Passport, SIM, folding umbrella",
    tags: [PACKING_TAG],
    color: "#d8f0e6",
    x: 700,
    y: 250,
    rot: 1,
  }),
  n({
    title: "Get an EasyCard at the airport",
    tags: [ARRIVAL_TAG],
    color: "#dbe7ff",
    x: 480,
    y: 380,
    rot: 2,
  }),
  n({
    title: "Change yen to NT$",
    tags: [TODO_TAG],
    color: "#ead9ff",
    x: 700,
    y: 400,
    rot: -1.5,
    due: Temporal.PlainDate.from("2026-10-30"),
    assignee: KEN,
  }),
  n({
    title: "Set up the eSIM",
    tags: [TODO_TAG],
    color: "#ead9ff",
    x: 720,
    y: 520,
    rot: 1,
  }),
];
