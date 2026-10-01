import { Temporal } from "temporal-polyfill-lite";

import {
  ARRIVAL_TAG,
  PACKING_TAG,
  type Memo,
  type Note,
  type NoteId,
  type NoteStatus,
  type Schedule,
  type Suggestion,
} from "../features/notes/types";

import { CLAUDE, KEN, YUKI } from "./members";

/** On `date`, at `time` ("" for anytime) */
const on = (date: string, time: string, status: NoteStatus): Schedule => ({
  date: Temporal.PlainDate.from(date),
  time: time ? Temporal.PlainTime.from(time) : null,
  status,
});
const pin = (lat: number, lng: number) => ({ lat, lng });

let i = 0;
const card = (): Pick<Memo, "id" | "color" | "rot" | "by" | "updatedAt"> => ({
  id: ("s" + i++) as NoteId,
  color: "#fff1b8",
  rot: 0,
  by: YUKI,
  updatedAt: Temporal.Now.instant(),
});
const n = (p: Partial<Memo> & Pick<Memo, "title" | "x" | "y">): Memo => ({
  ...card(),
  kind: "memo",
  body: "",
  tags: [],
  mapsUrl: null,
  pin: null,
  schedule: null,
  budget: null,
  ...p,
});
const suggest = (p: Partial<Suggestion> & Pick<Suggestion, "title" | "x" | "y">): Suggestion => ({
  ...card(),
  kind: "suggestion",
  ...p,
});

export const mockNotes = (): Note[] => [
  n({
    title: "Din Tai Fung xiaolongbao",
    pin: pin(25.0335, 121.5301),
    body: "The main shop has a queue; the Taipei 101 branch is fine",
    tags: ["Food"],
    x: 40,
    y: 40,
    rot: -2,
    by: KEN,
    schedule: on("2026-11-03", "12:30", "fixed"),
    budget: 700,
    mapsUrl: "https://maps.google.com/?q=Din+Tai+Fung",
  }),
  n({
    title: "Jiufen at dusk",
    pin: pin(25.1094, 121.8453),
    body: "Aim for when the lanterns come on. The bus back gets crowded",
    tags: ["Jiufen", "Want to go"],
    color: "#ffd9de",
    x: 230,
    y: 52,
    rot: 1.5,
    schedule: on("2026-11-03", "16:00", "fixed"),
    mapsUrl: "https://maps.google.com/?q=Jiufen",
  }),
  n({
    title: "Taihu Brewing",
    pin: pin(25.0378, 121.5629),
    body: "Xinyi. Stop by after the night market",
    tags: ["Beer"],
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
    tags: ["Food", "Want to go"],
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
    tags: ["Shopping"],
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
    body: "Depends on the weather",
    tags: ["Want to go"],
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
    tags: ["Sweets"],
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
  n({
    title: "Le Blé d'Or honey lager",
    pin: pin(25.0415, 121.546),
    body: "Supposedly sweet. One glass is enough",
    tags: ["Beer"],
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
];
