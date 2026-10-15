// the airports, as the app takes them from the contract; the list itself is fetched (useAirports)
export {
  ALIASES,
  airportsOf,
  findAirport,
  suggestAirports,
  type Airport,
  type AirportCode,
} from "../../../contract/airports";
export { default as airportsUrl } from "../../../contract/airports.json?url";
