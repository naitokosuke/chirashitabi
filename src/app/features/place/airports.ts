import type { LatLng } from "./types";

/**
 * Airports with an IATA code and scheduled service, from OurAirports (airports.json, built by
 * scripts/airports.mjs): what a flight's from and to are matched against, for suggestions as
 * they are typed and for its point on the map.
 */
export interface Airport {
  code: string;
  name: string;
  city: string;
  country: string;
  at: LatLng;
}

/** airports.json as the script writes it */
export type AirportRow = [
  code: string,
  name: string,
  city: string,
  country: string,
  lat: number,
  lng: number,
];

export const airportOf = ([code, name, city, country, lat, lng]: AirportRow): Airport => ({
  code,
  name,
  city,
  country,
  at: { lat, lng },
});

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
 * The airports a typed word may mean, best first: its code exactly, then codes it begins, then
 * Japanese names, names and cities it is part of; at most `limit`
 */
export function suggestAirports(airports: Airport[], text: string, limit = 8): Airport[] {
  const t = text.trim().toLowerCase();
  if (t === "") return [];
  const rank = (a: Airport) => {
    const code = a.code.toLowerCase();
    if (code === t) return 0;
    if (code.startsWith(t)) return 1;
    if ((ALIASES[a.code] ?? "").includes(text.trim())) return 2;
    const name = a.name.toLowerCase();
    if (name.startsWith(t) || a.city.toLowerCase().startsWith(t)) return 3;
    // inside a word only from two letters on: one letter is in nearly every name
    if (t.length > 1 && (name.includes(t) || a.city.toLowerCase().includes(t))) return 4;
    return -1;
  };
  // within a rank, the airports a trip from Japan most often uses first (those with a Japanese name)
  const known = (a: Airport) => (ALIASES[a.code] === undefined ? 1 : 0);
  return airports
    .map((a) => ({ a, r: rank(a) }))
    .filter((x) => x.r >= 0)
    .sort((x, y) => (x.r !== y.r ? x.r - y.r : known(x.a) - known(y.a)))
    .slice(0, limit)
    .map((x) => x.a);
}
