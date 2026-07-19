import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { csvFile, csvUrl } from "./lib/csv.mjs";

const CKAN = "https://data.ca.gov/api/3/action/package_show?id=";
const FIB_PACKAGE = "surface-water-fecal-indicator-bacteria-results";
const HAB_PACKAGE = "surface-water-freshwater-harmful-algal-blooms";
const outputDirectory = path.join(process.cwd(), "src", "data");
const fibFileFlag = process.argv.indexOf("--fib-file");
const localFibFile = fibFileFlag >= 0 ? process.argv[fibFileFlag + 1] : undefined;
const forceRefresh = process.argv.includes("--force");

function clean(value) {
  return String(value ?? "").trim();
}

function number(value) {
  const parsed = Number.parseFloat(clean(value).replace(/[<>=]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function isoDate(value) {
  const date = new Date(clean(value));
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

function plausibleCaliforniaPoint(latitude, longitude) {
  return latitude >= 32 && latitude <= 42.2 && longitude >= -124.7 && longitude <= -114;
}

function plausibleObservation(date, generatedAt = Date.now()) {
  if (!date) return false;
  const value = new Date(date).valueOf();
  return value >= new Date("2000-01-01").valueOf() && value <= generatedAt + 24 * 60 * 60 * 1000;
}

async function packageInfo(id) {
  const response = await fetch(`${CKAN}${id}`, {
    headers: { "User-Agent": "BeforeYouDip/1.0 public-data-prototype" },
  });
  if (!response.ok) throw new Error(`CKAN package lookup failed: ${response.status}`);
  const payload = await response.json();
  if (!payload.success) throw new Error(`CKAN returned no package for ${id}`);
  return payload.result;
}

function resource(packageData, predicate) {
  const match = packageData.resources.find(predicate);
  if (!match) throw new Error(`Expected resource missing from ${packageData.name}`);
  return match;
}

async function buildFib(resourceData) {
  const latest = new Map();
  const rows = localFibFile ? csvFile(localFibFile) : await csvUrl(resourceData.url);
  let examined = 0;

  for await (const row of rows) {
    examined += 1;
    const analyte = clean(row.DW_AnalyteName || row.Analyte);
    if (!/(E\. coli|Enterococcus)/i.test(analyte)) continue;
    const stationCode = clean(row.StationCode);
    const latitude = number(row.TargetLatitude);
    const longitude = number(row.TargetLongitude);
    const sampledAt = isoDate(row.SampleDateTime || row.SampleDate);
    if (
      !stationCode ||
      latitude === null ||
      longitude === null ||
      !plausibleCaliforniaPoint(latitude, longitude) ||
      !plausibleObservation(sampledAt)
    ) continue;

    const key = `${stationCode}|${analyte.toLowerCase()}`;
    const candidate = {
      stationCode,
      stationName: clean(row.StationName) || stationCode,
      latitude,
      longitude,
      sampledAt,
      analyte,
      unit: clean(row.Unit),
      result: number(row.ResultSub || row.Result),
      thirtyDayGeoMean: number(row["30DayGeoMean"]),
      thirtyDayCount: number(row["30DayCount"]),
      sixWeekGeoMean: number(row["6WeekGeoMean"]),
      sixWeekCount: number(row["6WeekCount"]),
      dataQuality: clean(row.DataQuality),
      dataSource: clean(row.DataSource),
    };
    const existing = latest.get(key);
    if (!existing || candidate.sampledAt > existing.sampledAt) latest.set(key, candidate);
  }

  return { records: [...latest.values()], examined };
}

async function buildHab(resourceData) {
  const latest = new Map();
  const rows = await csvUrl(resourceData.url);
  let examined = 0;

  for await (const row of rows) {
    examined += 1;
    const latitude = number(row.Bloom_Latitude);
    const longitude = number(row.Bloom_Longitude || row["Bloom Longitude"]);
    const observedAt = isoDate(row.Observation_Date || row.Bloom_Date_Created);
    if (
      latitude === null ||
      longitude === null ||
      !plausibleCaliforniaPoint(latitude, longitude) ||
      !plausibleObservation(observedAt)
    ) continue;
    const waterBody = clean(row.Official_Water_Body_Name || row.Water_Body_Name || "Unnamed water body");
    const landmark = clean(row.Landmark);
    const key = `${waterBody.toLowerCase()}|${landmark.toLowerCase()}|${latitude.toFixed(3)}|${longitude.toFixed(3)}`;
    const candidate = {
      bloomReportId: clean(row.Bloom_Report_ID),
      waterBody,
      landmark,
      county: clean(row.County),
      latitude,
      longitude,
      observedAt,
      advisory: clean(row.Advisory_Recommended || row.Reported_Advisory_Types || "None"),
      advisoryStart: isoDate(row.AdvisoryStartDate || row.Advisory_Date),
      advisoryEnd: isoDate(row.AdvisoryEndDate),
      caseStatus: clean(row.Case_Status),
      caseEnd: isoDate(row.Case_End_Date),
      detail: clean(row.Advisory_Detail_Description || row.AdvisoryDetail),
    };
    const existing = latest.get(key);
    if (!existing || candidate.observedAt > existing.observedAt) latest.set(key, candidate);
  }

  return { records: [...latest.values()], examined };
}

const [fibPackage, habPackage] = await Promise.all([
  packageInfo(FIB_PACKAGE),
  packageInfo(HAB_PACKAGE),
]);
const fibResource = resource(
  fibPackage,
  (item) => /2020 to present/i.test(item.name) && item.format?.toUpperCase() === "CSV",
);
const habResource = resource(
  habPackage,
  (item) => item.name === "FHABS BLOOM REPORTS" && item.format?.toUpperCase() === "CSV",
);

if (!localFibFile && !forceRefresh) {
  try {
    const currentMetadata = JSON.parse(await readFile(path.join(outputDirectory, "source-metadata.json"), "utf8"));
    const sameFib = currentMetadata.packages?.fib?.resource?.hash === fibResource.hash;
    const sameHab = currentMetadata.packages?.hab?.resource?.hash === habResource.hash;
    if (sameFib && sameHab) {
      console.log("Source file hashes have not changed; the existing validated snapshot is already current.");
      process.exit(0);
    }
  } catch {
    // A missing or malformed local snapshot should be rebuilt from the source.
  }
}

console.log(`Reading bacteria observations from ${localFibFile || fibResource.url}`);
const [fib, hab] = await Promise.all([buildFib(fibResource), buildHab(habResource)]);
const generatedAt = new Date().toISOString();

await mkdir(outputDirectory, { recursive: true });
const outputs = [
  {
    name: "fib-latest.json",
    content: `${JSON.stringify({ generatedAt, source: fibResource.url, ...fib }, null, 2)}\n`,
  },
  {
    name: "hab-latest.json",
    content: `${JSON.stringify({ generatedAt, source: habResource.url, ...hab }, null, 2)}\n`,
  },
  {
    name: "source-metadata.json",
    content: `${JSON.stringify({
      generatedAt,
      packages: {
        fib: { id: FIB_PACKAGE, modified: fibPackage.metadata_modified, resource: fibResource },
        hab: { id: HAB_PACKAGE, modified: habPackage.metadata_modified, resource: habResource },
      },
    }, null, 2)}\n`,
  },
];

await Promise.all(outputs.map((output) => writeFile(path.join(outputDirectory, `${output.name}.tmp`), output.content)));
await Promise.all(outputs.map((output) => rename(
  path.join(outputDirectory, `${output.name}.tmp`),
  path.join(outputDirectory, output.name),
)));

console.log(`Wrote ${fib.records.length} current station/analyte records from ${fib.examined} FIB rows.`);
console.log(`Wrote ${hab.records.length} latest bloom-location records from ${hab.examined} HAB rows.`);
