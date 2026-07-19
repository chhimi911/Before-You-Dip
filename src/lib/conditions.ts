import fibSnapshot from "@/data/fib-latest.json";
import habSnapshot from "@/data/hab-latest.json";
import sourceMetadata from "@/data/source-metadata.json";
import {
  bacteriaComparison,
  describeCondition,
  type BacteriaReading,
  type BloomReading,
  type Tone,
} from "./status";

type FibRecord = BacteriaReading & {
  stationCode: string;
  stationName: string;
  latitude: number;
  longitude: number;
};

type HabRecord = BloomReading & {
  bloomReportId: string;
  waterBody: string;
  landmark: string;
  county: string;
  latitude: number;
  longitude: number;
  advisoryStart: string | null;
  caseEnd: string | null;
};

export type Condition = {
  id: string;
  name: string;
  subtitle: string;
  latitude: number;
  longitude: number;
  distanceMiles?: number;
  updatedAt: string | null;
  tone: Tone;
  label: string;
  human: string;
  dog: string;
  readings: Array<BacteriaReading & ReturnType<typeof bacteriaComparison>>;
  bloom: (HabRecord & { distanceMiles: number }) | null;
};

export type ConditionsResponse = {
  generatedAt: string;
  sourceModifiedAt: string;
  count: number;
  query: string;
  conditions: Condition[];
};

const fibRecords = fibSnapshot.records as FibRecord[];
const habRecords = habSnapshot.records as HabRecord[];

function radians(value: number) {
  return (value * Math.PI) / 180;
}

export function milesBetween(aLat: number, aLon: number, bLat: number, bLon: number) {
  const earthRadiusMiles = 3958.8;
  const lat = radians(bLat - aLat);
  const lon = radians(bLon - aLon);
  const value =
    Math.sin(lat / 2) ** 2 +
    Math.cos(radians(aLat)) * Math.cos(radians(bLat)) * Math.sin(lon / 2) ** 2;
  return 2 * earthRadiusMiles * Math.asin(Math.sqrt(value));
}

const stationGroups = new Map<string, FibRecord[]>();
for (const record of fibRecords) {
  const records = stationGroups.get(record.stationCode) ?? [];
  records.push(record);
  stationGroups.set(record.stationCode, records);
}

function nearestBloom(latitude: number, longitude: number, stationName: string) {
  let best: (HabRecord & { distanceMiles: number }) | null = null;
  const genericWaterWords = new Set(["beach", "lake", "river", "creek", "water", "park", "reservoir", "pond", "shore"]);
  const stationWords = new Set(
    stationName
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length >= 4 && !genericWaterWords.has(word)),
  );

  for (const bloom of habRecords) {
    const distanceMiles = milesBetween(latitude, longitude, bloom.latitude, bloom.longitude);
    if (distanceMiles > 4) continue;
    const bloomText = `${bloom.waterBody} ${bloom.landmark}`.toLowerCase();
    const nameMatch = [...stationWords].some((word) => bloomText.includes(word));
    if (!nameMatch && distanceMiles > 0.25) continue;
    if (!best || distanceMiles < best.distanceMiles) best = { ...bloom, distanceMiles };
  }
  return best;
}

function toCondition(records: FibRecord[], origin?: { latitude: number; longitude: number }): Condition {
  const base = [...records].sort((a, b) => b.sampledAt.localeCompare(a.sampledAt))[0];
  const bloom = nearestBloom(base.latitude, base.longitude, base.stationName);
  const condition = describeCondition(records, bloom);
  const updatedAt = [base.sampledAt, bloom?.observedAt].filter(Boolean).sort().at(-1) ?? null;
  const stationPrefix = base.stationName.toLowerCase().startsWith(base.stationCode.toLowerCase())
    ? base.stationName.slice(base.stationCode.length).replace(/^[-–— ]+/, "")
    : base.stationName;

  return {
    id: base.stationCode,
    name: stationPrefix || base.stationName,
    subtitle: `${base.stationCode} · ${base.dataSource || "California open data"}`,
    latitude: base.latitude,
    longitude: base.longitude,
    distanceMiles: origin
      ? milesBetween(origin.latitude, origin.longitude, base.latitude, base.longitude)
      : undefined,
    updatedAt,
    ...condition,
    readings: records.map((reading) => ({ ...reading, ...bacteriaComparison(reading) })),
    bloom,
  };
}

function bloomToCondition(bloom: HabRecord, origin?: { latitude: number; longitude: number }): Condition {
  const condition = describeCondition([], bloom);
  return {
    id: `hab-${bloom.bloomReportId}`,
    name: bloom.landmark && !bloom.landmark.toLowerCase().includes(bloom.waterBody.toLowerCase())
      ? `${bloom.waterBody} · ${bloom.landmark}`
      : bloom.waterBody,
    subtitle: `${bloom.county || "California"} · Harmful algae report`,
    latitude: bloom.latitude,
    longitude: bloom.longitude,
    distanceMiles: origin
      ? milesBetween(origin.latitude, origin.longitude, bloom.latitude, bloom.longitude)
      : undefined,
    updatedAt: bloom.observedAt,
    ...condition,
    readings: [],
    bloom: { ...bloom, distanceMiles: 0 },
  };
}

export function getConditions(options: {
  query?: string;
  latitude?: number;
  longitude?: number;
  limit?: number;
} = {}): ConditionsResponse {
  const query = options.query?.trim().toLowerCase() ?? "";
  const hasOrigin = Number.isFinite(options.latitude) && Number.isFinite(options.longitude);
  const origin = hasOrigin
    ? { latitude: options.latitude as number, longitude: options.longitude as number }
    : undefined;
  let conditions = [
    ...[...stationGroups.values()].map((records) => toCondition(records, origin)),
    ...habRecords.map((bloom) => bloomToCondition(bloom, origin)),
  ];

  if (query) {
    const terms = query.split(/\s+/).filter(Boolean);
    conditions = conditions.filter((condition) => {
      const text = `${condition.name} ${condition.subtitle} ${condition.bloom?.waterBody ?? ""} ${condition.bloom?.county ?? ""}`.toLowerCase();
      return terms.every((term) => text.includes(term));
    });
  }

  const byRelevance = (a: Condition, b: Condition) => {
    const toneRank = { avoid: 0, caution: 1, recent: 2, unknown: 3 };
    return toneRank[a.tone] - toneRank[b.tone] || (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");
  };

  if (origin) {
    conditions.sort((a, b) => (a.distanceMiles ?? Infinity) - (b.distanceMiles ?? Infinity));
  } else if (query) {
    conditions.sort(byRelevance);
  } else {
    const featuredNames = ["clear lake", "lake berryessa", "lake tahoe", "sacramento river"];
    const featured = featuredNames.flatMap((name) => {
      const matches = conditions.filter((item) => item.name.toLowerCase().includes(name)).sort(byRelevance);
      return matches.slice(0, 1);
    });
    const featuredIds = new Set(featured.map((item) => item.id));
    const remaining = conditions.filter((item) => !featuredIds.has(item.id)).sort(byRelevance);
    conditions = [...featured, ...remaining];
  }

  const limit = Math.min(Math.max(options.limit ?? 36, 1), 100);
  return {
    generatedAt: fibSnapshot.generatedAt,
    sourceModifiedAt: [
      sourceMetadata.packages.fib.resource.last_modified,
      sourceMetadata.packages.hab.resource.last_modified,
    ].sort().at(-1) ?? sourceMetadata.generatedAt,
    count: conditions.length,
    query,
    conditions: conditions.slice(0, limit),
  };
}

export function getSourceSnapshot() {
  return sourceMetadata;
}
