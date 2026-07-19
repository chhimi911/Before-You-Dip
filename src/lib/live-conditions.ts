import {
  buildConditionsResponse,
  getConditions,
  type ConditionsResponse,
  type FibRecord,
  type HabRecord,
} from "./conditions";

const CKAN = "https://data.ca.gov/api/3/action";
const FIB_PACKAGE = "surface-water-fecal-indicator-bacteria-results";
const HAB_PACKAGE = "surface-water-freshwater-harmful-algal-blooms";

type CkanResource = {
  id: string;
  name: string;
  format?: string;
  datastore_active?: boolean;
  last_modified?: string | null;
};

type CkanPackage = {
  metadata_modified: string;
  resources: CkanResource[];
};

type LiveOptions = {
  query?: string;
  label?: string;
  latitude?: number;
  longitude?: number;
  limit?: number;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function number(value: unknown) {
  if (value === "" || value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isoDate(value: unknown) {
  const text = clean(value);
  if (!text) return null;
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(text) ? text : `${text}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

function californiaPoint(latitude: number, longitude: number) {
  return latitude >= 32 && latitude <= 42.2 && longitude >= -124.7 && longitude <= -114;
}

function safeTerms(query: string) {
  return query
    .replace(/[^a-zA-Z0-9.'’() -]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6)
    .map((term) => term.replaceAll("'", "''"));
}

async function packageInfo(id: string) {
  const response = await fetch(`${CKAN}/package_show?id=${encodeURIComponent(id)}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`Catalog lookup failed (${response.status})`);
  const payload = await response.json() as { success: boolean; result: CkanPackage };
  if (!payload.success) throw new Error("Catalog lookup returned no package");
  return payload.result;
}

async function datastoreSql(sql: string) {
  const url = new URL(`${CKAN}/datastore_search_sql`);
  url.searchParams.set("sql", sql);
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Live DataStore query failed (${response.status})`);
  const payload = await response.json() as {
    success: boolean;
    result: { records: Array<Record<string, unknown>> };
  };
  if (!payload.success) throw new Error("Live DataStore returned no records object");
  return payload.result.records;
}

function locationClause(
  latitude: number | undefined,
  longitude: number | undefined,
  latitudeField: string,
  longitudeField: string,
) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return "";
  const lat = latitude as number;
  const lon = longitude as number;
  const radius = 1.5;
  return ` AND ${latitudeField} BETWEEN ${(lat - radius).toFixed(5)} AND ${(lat + radius).toFixed(5)}`
    + ` AND ${longitudeField} BETWEEN ${(lon - radius).toFixed(5)} AND ${(lon + radius).toFixed(5)}`;
}

function nameClause(query: string | undefined, fields: string[]) {
  const terms = safeTerms(query ?? "");
  if (!terms.length) return "";
  return terms.map((term) => ` AND (${fields.map((field) => `${field} ILIKE '%${term}%'`).join(" OR ")})`).join("");
}

function fibQuery(resourceId: string, options: LiveOptions) {
  const hasFocus = Boolean(options.query?.trim()) || (Number.isFinite(options.latitude) && Number.isFinite(options.longitude));
  return `SELECT "StationCode","StationName","SampleDateTime","Analyte","DW_AnalyteName","Unit","Result","ResultSub","TargetLatitude","TargetLongitude","30DayGeoMean","30DayCount","6WeekGeoMean","6WeekCount","DataSource","DataQuality" FROM "${resourceId}"`
    + ` WHERE ("DW_AnalyteName" ILIKE '%E. coli%' OR "DW_AnalyteName" ILIKE '%Enterococcus%' OR "Analyte" ILIKE '%E. coli%' OR "Analyte" ILIKE '%Enterococcus%')`
    + ` AND "TargetLatitude" IS NOT NULL AND "TargetLongitude" IS NOT NULL`
    + nameClause(options.query, [`"StationName"`, `"StationCode"`])
    + locationClause(options.latitude, options.longitude, `"TargetLatitude"`, `"TargetLongitude"`)
    + ` ORDER BY "SampleDateTime" DESC LIMIT ${hasFocus ? 1200 : 220}`;
}

function habQuery(resourceId: string, options: LiveOptions) {
  const hasFocus = Boolean(options.query?.trim()) || (Number.isFinite(options.latitude) && Number.isFinite(options.longitude));
  return `SELECT "Bloom_Report_ID","Bloom_Date_Created","Water_Body_Name","Official_Water_Body_Name","Landmark","County","Bloom_Latitude","Bloom_Longitude","Observation_Date","Reported_Advisory_Types","Advisory_Recommended","Advisory_Date","AdvisoryStartDate","AdvisoryEndDate","AdvisoryDetail","Advisory_Detail_Description","Case_Status","Case_End_Date" FROM "${resourceId}"`
    + ` WHERE "Bloom_Latitude" IS NOT NULL AND "Bloom_Longitude" IS NOT NULL`
    + nameClause(options.query, [`"Water_Body_Name"`, `"Official_Water_Body_Name"`, `"Landmark"`, `"County"`])
    + locationClause(options.latitude, options.longitude, `"Bloom_Latitude"`, `"Bloom_Longitude"`)
    + ` ORDER BY "Observation_Date" DESC LIMIT ${hasFocus ? 500 : 100}`;
}

function mapFib(rows: Array<Record<string, unknown>>) {
  const latest = new Map<string, FibRecord>();
  for (const row of rows) {
    const stationCode = clean(row.StationCode);
    const analyte = clean(row.DW_AnalyteName || row.Analyte);
    const latitude = number(row.TargetLatitude);
    const longitude = number(row.TargetLongitude);
    const sampledAt = isoDate(row.SampleDateTime);
    if (!stationCode || !analyte || latitude === null || longitude === null || !sampledAt || !californiaPoint(latitude, longitude)) continue;
    const candidate: FibRecord = {
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
    const key = `${stationCode}|${analyte.toLowerCase()}`;
    const existing = latest.get(key);
    if (!existing || candidate.sampledAt > existing.sampledAt) latest.set(key, candidate);
  }
  return [...latest.values()];
}

function mapHab(rows: Array<Record<string, unknown>>) {
  const latest = new Map<string, HabRecord>();
  for (const row of rows) {
    const latitude = number(row.Bloom_Latitude);
    const longitude = number(row.Bloom_Longitude);
    const observedAt = isoDate(row.Observation_Date || row.Bloom_Date_Created);
    if (latitude === null || longitude === null || !observedAt || !californiaPoint(latitude, longitude)) continue;
    const waterBody = clean(row.Official_Water_Body_Name || row.Water_Body_Name) || "Unnamed water body";
    const landmark = clean(row.Landmark);
    const candidate: HabRecord = {
      bloomReportId: clean(row.Bloom_Report_ID),
      waterBody,
      landmark,
      county: clean(row.County),
      latitude,
      longitude,
      observedAt,
      advisory: clean(row.Advisory_Recommended || row.Reported_Advisory_Types) || "None",
      advisoryStart: isoDate(row.AdvisoryStartDate || row.Advisory_Date),
      advisoryEnd: isoDate(row.AdvisoryEndDate),
      caseStatus: clean(row.Case_Status),
      caseEnd: isoDate(row.Case_End_Date),
      detail: clean(row.Advisory_Detail_Description || row.AdvisoryDetail),
    };
    const key = `${waterBody.toLowerCase()}|${landmark.toLowerCase()}|${latitude.toFixed(3)}|${longitude.toFixed(3)}`;
    const existing = latest.get(key);
    if (!existing || candidate.observedAt > existing.observedAt) latest.set(key, candidate);
  }
  return [...latest.values()];
}

function snapshotFallback(options: LiveOptions, reason: string): ConditionsResponse {
  const snapshot = getConditions(options);
  return { ...snapshot, fallbackReason: reason };
}

export async function getLiveConditions(options: LiveOptions = {}): Promise<ConditionsResponse> {
  try {
    const [fibPackage, habPackage] = await Promise.all([packageInfo(FIB_PACKAGE), packageInfo(HAB_PACKAGE)]);
    const fibResource = fibPackage.resources.find((item) => item.datastore_active && /2020 to present/i.test(item.name));
    const habResource = habPackage.resources.find((item) => item.datastore_active && /bloom reports/i.test(item.name));
    if (!fibResource || !habResource) throw new Error("A current DataStore resource is unavailable");

    const [fibRows, habRows] = await Promise.all([
      datastoreSql(fibQuery(fibResource.id, options)),
      datastoreSql(habQuery(habResource.id, options)),
    ]);
    const checkedAt = new Date().toISOString();
    const sourceModifiedAt = [fibResource.last_modified, habResource.last_modified, fibPackage.metadata_modified, habPackage.metadata_modified]
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? checkedAt;
    const response = buildConditionsResponse(mapFib(fibRows), mapHab(habRows), {
      ...options,
      generatedAt: checkedAt,
      sourceModifiedAt,
      checkedAt,
      dataMode: "live",
    });

    if (!response.count && (options.query || Number.isFinite(options.latitude))) {
      const fallback = snapshotFallback(options, "No live record was returned in the focused search area, so these results use the verified daily snapshot.");
      return fallback.count ? fallback : response;
    }
    return response;
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Live source unavailable";
    return snapshotFallback(options, `${detail}. Showing the verified daily snapshot instead.`);
  }
}
