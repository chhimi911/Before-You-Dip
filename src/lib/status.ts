export type Tone = "avoid" | "caution" | "recent" | "unknown";

export type BacteriaReading = {
  analyte: string;
  sampledAt: string;
  result: number | null;
  thirtyDayGeoMean: number | null;
  thirtyDayCount: number | null;
  sixWeekGeoMean: number | null;
  sixWeekCount: number | null;
  unit: string;
  dataQuality: string;
  dataSource: string;
};

export type BloomReading = {
  observedAt: string;
  advisory: string;
  caseStatus: string;
  advisoryEnd: string | null;
  detail: string;
};

export function daysSince(date: string, now = new Date()) {
  const value = new Date(date).valueOf();
  return Math.max(0, Math.floor((now.valueOf() - value) / 86_400_000));
}

export function bacteriaComparison(reading: BacteriaReading) {
  const enterococcus = /enterococcus/i.test(reading.analyte);
  const geometricMeanLimit = enterococcus ? 30 : 100;
  const singleSampleLine = enterococcus ? 110 : 320;
  const geometricMean = reading.sixWeekGeoMean ?? reading.thirtyDayGeoMean;
  const count = reading.sixWeekCount ?? reading.thirtyDayCount ?? 0;
  const geometricMeanAbove = geometricMean !== null && count >= 2 && geometricMean > geometricMeanLimit;
  const sampleAbove = reading.result !== null && reading.result > singleSampleLine;

  return {
    geometricMean,
    geometricMeanLimit,
    singleSampleLine,
    above: geometricMeanAbove || sampleAbove,
    reason: geometricMeanAbove
      ? `${reading.analyte} rolling geometric mean is above ${geometricMeanLimit}`
      : sampleAbove
        ? `${reading.analyte} result is above the ${singleSampleLine} comparison line`
        : `${reading.analyte} result is below the available comparison lines`,
  };
}

export function isActiveAdvisory(bloom: BloomReading | null, now = new Date()) {
  if (!bloom) return false;
  const recommendation = bloom.advisory.toLowerCase();
  const meaningful = /\b(?:caution|warning|danger|closure|closed|avoid(?:\s+water)?|do not (?:swim|enter|touch))\b/.test(recommendation);
  const open = /open|ongoing|active/i.test(bloom.caseStatus);
  const notEnded = !bloom.advisoryEnd || new Date(bloom.advisoryEnd) >= now;
  return meaningful && open && notEnded;
}

export function describeCondition(
  readings: BacteriaReading[],
  bloom: BloomReading | null,
  now = new Date(),
) {
  const newest = [...readings].sort((a, b) => b.sampledAt.localeCompare(a.sampledAt))[0];
  const freshReadings = readings.filter((reading) => daysSince(reading.sampledAt, now) <= 45);
  const above = freshReadings.find((reading) => bacteriaComparison(reading).above);
  const bloomFresh = bloom ? daysSince(bloom.observedAt, now) <= 60 : false;

  if (isActiveAdvisory(bloom, now)) {
    return {
      tone: "avoid" as Tone,
      label: "Open advisory in source",
      human: "The packaged source record lists an advisory as open. Verify locally and avoid water contact until confirmed.",
      dog: "The source lists an open advisory. Keep dogs out and verify with the local water-body manager.",
    };
  }
  if (bloom && bloomFresh && /open|ongoing/i.test(bloom.caseStatus)) {
    return {
      tone: "caution" as Tone,
      label: "Bloom under review",
      human: "Use extra caution. Avoid visible scum, foam, or discolored water.",
      dog: "Keep dogs out until the bloom report is resolved; dogs can become ill quickly.",
    };
  }
  if (above) {
    return {
      tone: "caution" as Tone,
      label: "Recent result above objective",
      human: "A recent bacteria result is above a statewide comparison value. Consider another spot.",
      dog: "Avoid drinking or swimming here until newer evidence is available.",
    };
  }
  if (freshReadings.length > 0) {
    return {
      tone: "recent" as Tone,
      label: "Recent result below objective",
      human: "Recent available results are below the comparison values shown here. Conditions can still change.",
      dog: "No recent bacteria flag is shown, but check the shoreline and never let dogs drink untreated water.",
    };
  }
  return {
    tone: "unknown" as Tone,
    label: "No recent evidence",
    human: newest
      ? "The newest bacteria result is older than 45 days. Treat current conditions as unknown."
      : "No recent bacteria result or active advisory was found near this spot.",
    dog: "Without recent evidence, keep dogs out if the water looks green, foamy, scummy, or smells unusual.",
  };
}
