import * as v from "valibot";

import rows from "./airports-data.json";

/**
 * An airport's IATA code that is on the list (airports-data.json): what a flight's from and to are.
 * Only the list mints one (airportsOf), or the room, which checked it against the same list.
 */
export const AirportCodeSchema = v.pipe(v.string(), v.regex(/^[A-Z]{3}$/), v.brand("AirportCode"));

export type AirportCode = v.InferOutput<typeof AirportCodeSchema>;

/** A row of airports-data.json as the script writes it, as the airport it is */
const AirportRowSchema = v.pipe(
  v.strictTuple([AirportCodeSchema, v.string(), v.string(), v.string(), v.number(), v.number()]),
  v.transform(([code, name, city, country, lat, lng]) => ({
    code,
    name,
    city,
    country,
    at: { lat, lng },
  })),
);

/**
 * Airports with an IATA code and scheduled service, from OurAirports (airports-data.json, built by
 * scripts/airports.mjs): what a flight's from and to are matched against, for suggestions as
 * they are typed and for its point on the map.
 */
export type Airport = v.InferOutput<typeof AirportRowSchema>;

/** airports-data.json as the airports; a row that is not one is left out */
export const airportsOf = (rows: unknown): Airport[] => {
  const list = v.safeParse(v.array(v.unknown()), rows);
  return (list.success ? list.output : []).flatMap((row) => {
    const airport = v.safeParse(AirportRowSchema, row);
    return airport.success ? [airport.output] : [];
  });
};

/**
 * Japanese names people type for the airports a trip from Japan most often uses, which
 * OurAirports writes only in English
 */
export const ALIASES: Readonly<Record<string, string>> = {
  HND: "羽田 東京国際空港",
  NRT: "成田 成田国際空港",
  KIX: "関西 関空 関西国際空港 大阪",
  ITM: "伊丹 大阪国際空港",
  UKB: "神戸",
  NGO: "中部 セントレア 名古屋",
  FUK: "福岡",
  CTS: "新千歳 札幌",
  OKA: "那覇 沖縄",
  SDJ: "仙台",
  HIJ: "広島",
  KOJ: "鹿児島",
  KMJ: "熊本",
  KIJ: "新潟",
  TPE: "桃園 台北 台湾桃園国際空港",
  TSA: "松山 台北松山",
  KHH: "高雄",
  RMQ: "台中",
  ICN: "仁川 ソウル",
  GMP: "金浦 ソウル",
  PUS: "金海 釜山",
  CJU: "済州",
  HKG: "香港",
  MFM: "マカオ",
  PVG: "浦東 上海",
  SHA: "虹橋 上海",
  PEK: "北京首都",
  PKX: "北京大興",
  BKK: "スワンナプーム バンコク",
  DMK: "ドンムアン バンコク",
  SIN: "チャンギ シンガポール",
  KUL: "クアラルンプール",
  MNL: "マニラ",
  SGN: "タンソンニャット ホーチミン",
  HAN: "ノイバイ ハノイ",
  DAD: "ダナン",
  DPS: "デンパサール バリ",
  HNL: "ホノルル ハワイ",
  GUM: "グアム",
};

/** The airport a flight's from or to names: its code, or its name or a Japanese name as written */
export function findAirport(airports: Airport[], text: string): Airport | undefined {
  const t = text.trim();
  if (t === "") return undefined;
  const code = t.toUpperCase();
  return (
    airports.find((a) => a.code === code) ??
    airports.find((a) => a.name.toLowerCase() === t.toLowerCase()) ??
    airports.find((a) => (ALIASES[a.code] ?? "").split(" ").includes(t))
  );
}

/**
 * The list, loaded, for the room to hold a flight to: a flight's from and to are codes on it, and
 * nothing else. Pure, so a bundle that never checks a code (the app's, which fetches the list)
 * leaves airports-data.json out.
 */
const AIRPORTS: Airport[] = /* @__PURE__ */ airportsOf(rows);
const CODES = /* @__PURE__ */ new Set<string>(/* @__PURE__ */ AIRPORTS.map((a) => a.code));

const AirportCodeOnListSchema = v.pipe(
  AirportCodeSchema,
  v.check((code) => CODES.has(code)),
);

/** A code on the list, exactly as the app writes it */
export const isAirportCode = (value: unknown): value is AirportCode =>
  v.safeParse(AirportCodeOnListSchema, value).success;

/**
 * The airport a flight kept before codes were required names (a code in any case, a name, or a
 * Japanese name), or null when it names none
 */
export const airportCodeOf = (text: string): AirportCode | null =>
  findAirport(AIRPORTS, text)?.code ?? null;
