/**
 * Rebuild src/data/pincodes.json from India Post's pincode directory:
 *
 *   npm run data:pincodes -- path/to/pincode.csv
 *
 * The source is the "All India Pincode Directory" the Department of Posts
 * publishes on data.gov.in (Government Open Data License — India). The
 * portal puts the full download behind a sign-in form, so the committed
 * file was built from an MIT-licensed mirror of the same export with the
 * same eleven columns:
 *
 *   https://raw.githubusercontent.com/dropdevrahul/pincodes-india/main/pincode.csv
 *
 * Either file works. Download one, point this at it, commit the result.
 * The directory changes a handful of rows a month, so this is a few-times-
 * a-year chore rather than something the server should do at boot.
 *
 * What is kept is only what the address form uses — the district (offered
 * as the city), the state, and the post office names (offered as the
 * area). Circle, region, division, office type and the coordinates are
 * dropped, which is most of the 24 MB.
 *
 * No database. The lookup is read-only, public and the same for everyone,
 * and ~19k rows held in memory is cheaper than a table, a migration and an
 * import job on the shared database.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { PINCODE_REGEX } from "../validators/address.rules.js";

const OUT_FILE = fileURLToPath(new URL("../data/pincodes.json", import.meta.url));

const COLUMNS = ["OfficeName", "Pincode", "District", "StateName"];

/**
 * The state as the checkout dropdown spells it.
 *
 * The directory shouts ("TAMIL NADU"), and one union territory is filed
 * under its full legal name with a leading article. Every value here must
 * appear in STATES in frontend/src/lib/states.js, or a pincode would fill
 * the state with something the select cannot show.
 */
const STATE_NAMES = {
  "THE DADRA AND NAGAR HAVELI AND DAMAN AND DIU": "Dadra and Nagar Haveli and Daman and Diu",
};

const SMALL_WORDS = new Set(["and", "of", "the"]);

/** "KUMURAM BHEEM ASIFABAD" -> "Kumuram Bheem Asifabad". */
const titleCase = (value) =>
  value
    .toLowerCase()
    .split(/(\s+|-|\()/)
    .map((word, index) =>
      index > 0 && SMALL_WORDS.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join("");

const stateName = (raw) => STATE_NAMES[raw] ?? titleCase(raw);

/**
 * The district, as the city a shopper would write.
 *
 * Mostly the district is the answer — "Coimbatore", "Ernakulam". The
 * exceptions are the metros the directory files by administrative zone:
 * nobody in Lajpat Nagar writes "South East" on a parcel. Only the ones
 * that would read as wrong are listed; a rural district is still a better
 * prefill than an empty box, and the form never overwrites a city the
 * shopper typed.
 */
const DELHI_ZONES = ["Central", "East", "North", "North East", "North West", "Shahdara", "South", "South East", "South West", "West"];

const CITY_FOR_DISTRICT = {
  ...Object.fromEntries(DELHI_ZONES.map((zone) => [`Delhi|${zone}`, "Delhi"])),
  "Karnataka|Bengaluru Urban": "Bengaluru",
  "Karnataka|Bengaluru Rural": "Bengaluru",
  "Maharashtra|Mumbai Suburban": "Mumbai",
  "Telangana|Warangal Urban": "Warangal",
  "Telangana|Warangal Rural": "Warangal",
  "Lakshadweep|Lakshadweep District": "Lakshadweep",
};

const cityName = (state, district) => CITY_FOR_DISTRICT[`${state}|${district}`] ?? district;

/**
 * A post office's name as an area a shopper would recognise.
 *
 * "Thygarayanagar H.O" -> "Thygarayanagar". The suffix says which kind of
 * office it is (head, sub, branch), and "ND" marks one that does not
 * deliver; neither is part of the place's name. Whatever follows the
 * office type goes too — it is the parent office or district the
 * directory adds to tell two same-named offices apart ("Aliganj SO South
 * Delhi", "Kautha B.O BASMATH", "Sirigere S.O(Ballari)"), and the form
 * already shows the district as the city.
 *
 * Names the directory has in capitals are title-cased so the list does
 * not shout at random. GPO is left alone: "Delhi GPO" is what the place
 * is called.
 */
const PARENT_IN_BRACKETS = /\s*\([^)]*\)\s*[BSH]\.?O\.?$|\s*\([^)]*\b[BSH]\.?O\.?\)$/i;
const GLUED_OFFICE_TYPE = /\.[BSH]O$/i;
const OFFICE_TYPE_AND_AFTER = /\s+(?:N\.?D\.?\s*)?(?:[BSH]\.?O\.?|PO|T\.?S\.?O\.?)(?=$|[\s('.-]).*$/i;
const NON_DELIVERY = /\s+N\.?D\.?$/i;

const areaName = (raw) => {
  const original = raw.trim();
  const name = original
    .replace(PARENT_IN_BRACKETS, "")
    .replace(GLUED_OFFICE_TYPE, "")
    .replace(OFFICE_TYPE_AND_AFTER, "")
    .replace(NON_DELIVERY, "")
    .replace(/\s+/g, " ")
    .trim();

  const kept = name || original;
  return kept === kept.toUpperCase() ? titleCase(kept) : kept;
};

/**
 * One line of the export.
 *
 * A real quoted-CSV split rather than `split(",")`: the mirror quotes every
 * field and the data.gov.in file quotes only some, and an office name with
 * a comma in it would otherwise shift every column after it.
 */
const parseLine = (line) => {
  if (!line.trim()) return null;

  const fields = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      fields.push(field);
      field = "";
    } else {
      field += char;
    }
  }

  fields.push(field);
  return fields;
};

const run = async () => {
  const source = process.argv[2];

  if (!source) {
    console.error("[data:pincodes] usage: npm run data:pincodes -- path/to/pincode.csv");
    process.exitCode = 1;
    return;
  }

  const lines = (await readFile(source, "utf8")).split(/\r?\n/);
  const header = parseLine(lines[0]).map((name) => name.toLowerCase());
  const at = Object.fromEntries(COLUMNS.map((name) => [name, header.indexOf(name.toLowerCase())]));

  const missing = COLUMNS.filter((name) => at[name] < 0);
  if (missing.length) throw new Error(`missing column(s): ${missing.join(", ")}`);

  // pincode -> { districts: Map<name, count>, state, areas: Set }
  const byPin = new Map();
  let skipped = 0;

  for (const line of lines.slice(1)) {
    const fields = parseLine(line);
    if (!fields) continue;

    const pincode = fields[at.Pincode]?.trim();

    // The directory carries a "TEST OFFICE" under 999999, filed in Salem
    // and Nizamabad at once. A shopper typing nines should get "not
    // found", not a city.
    if (!PINCODE_REGEX.test(pincode ?? "") || /^test office$/i.test(fields[at.OfficeName].trim())) {
      skipped += 1;
      continue;
    }

    let entry = byPin.get(pincode);
    if (!entry) {
      entry = { districts: new Map(), state: stateName(fields[at.StateName].trim()), areas: new Set() };
      byPin.set(pincode, entry);
    }

    const district = titleCase(fields[at.District].trim());
    entry.districts.set(district, (entry.districts.get(district) ?? 0) + 1);
    entry.areas.add(areaName(fields[at.OfficeName]));
  }

  // States are stored once and referenced by index — there are 36 of them
  // and 19k pincodes, so spelling each one out would be a third of the file.
  const states = [...new Set([...byPin.values()].map((entry) => entry.state))].sort();
  const stateIndex = new Map(states.map((name, index) => [name, index]));

  const pincodes = {};

  for (const pincode of [...byPin.keys()].sort()) {
    const entry = byPin.get(pincode);

    // A pincode straddling two districts is rare; the one most of its
    // offices sit in is the better guess at what the shopper calls home.
    const [district] = [...entry.districts].sort((a, b) => b[1] - a[1])[0];

    pincodes[pincode] = [
      stateIndex.get(entry.state),
      cityName(entry.state, district),
      [...entry.areas].sort((a, b) => a.localeCompare(b)),
    ];
  }

  await mkdir(path.dirname(OUT_FILE), { recursive: true });
  await writeFile(
    OUT_FILE,
    JSON.stringify({ source: path.basename(source), builtAt: new Date().toISOString(), states, pincodes }),
  );

  console.log(
    `[data:pincodes] OK — ${byPin.size} pincodes, ${states.length} states` +
      (skipped ? `, ${skipped} row(s) skipped` : "") +
      ` -> ${path.relative(process.cwd(), OUT_FILE)}`,
  );
};

try {
  await run();
} catch (error) {
  console.error(`[data:pincodes] FAILED  ${error.message}`);
  process.exitCode = 1;
}
