import { ALIASES, type Airport } from "../../../contract/airports";

// the airports, as the app takes them from the contract; the list itself is fetched (useAirports)
export {
  ALIASES,
  AirportCodeSchema,
  airportsOf,
  findAirport,
  type Airport,
  type AirportCode,
} from "../../../contract/airports";
export { default as airportsUrl } from "../../../contract/airports.json?url";

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
