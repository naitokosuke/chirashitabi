// Builds src/contract/airports-data.json from OurAirports
// (https://github.com/davidmegginson/ourairports-data, released into the public domain under
// The Unlicense: free to use, change and redistribute, with no warranty of accuracy):
// every airport with an IATA code and scheduled service, as
// [code, name, city, country, lat, lng]. Run again to refresh it:
//
//   vp node scripts/airports.mjs
//
// or, with the CSV already on disk: vp node scripts/airports.mjs path/to/airports.csv
import { readFileSync, writeFileSync } from "node:fs";

const SOURCE = "https://davidmegginson.github.io/ourairports-data/airports.csv";
const OUT = new URL("../src/contract/airports-data.json", import.meta.url);

const from = process.argv[2];
const csv = from === undefined ? await (await fetch(SOURCE)).text() : readFileSync(from, "utf8");

/** RFC 4180: quoted fields may hold commas, line breaks and doubled quotes */
function rows(text) {
  const out = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      out.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length > 0) out.push([...row, field]);
  return out;
}

const [header, ...body] = rows(csv);
const col = (name) => {
  const i = header.indexOf(name);
  if (i === -1) throw new Error(`airports.csv has no ${name} column`);
  return i;
};
const [IATA, NAME, CITY, COUNTRY, LAT, LNG, SCHEDULED, TYPE] = [
  "iata_code",
  "name",
  "municipality",
  "iso_country",
  "latitude_deg",
  "longitude_deg",
  "scheduled_service",
  "type",
].map(col);

const KINDS = new Set(["large_airport", "medium_airport", "small_airport"]);
const round = (n) => Math.round(Number(n) * 1e4) / 1e4;
const airports = body
  .filter((r) => /^[A-Z]{3}$/.test(r[IATA] ?? "") && r[SCHEDULED] === "yes" && KINDS.has(r[TYPE]))
  .map((r) => [r[IATA], r[NAME], r[CITY], r[COUNTRY], round(r[LAT]), round(r[LNG])])
  .filter((a) => Number.isFinite(a[4]) && Number.isFinite(a[5]))
  .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

// one entry per code: the first (OurAirports lists a code once for a working airport)
const seen = new Set();
const unique = airports.filter((a) => {
  if (seen.has(a[0])) return false;
  seen.add(a[0]);
  return true;
});

writeFileSync(OUT, `${JSON.stringify(unique)}\n`);
console.log(`${unique.length} airports -> ${OUT.pathname}`);
