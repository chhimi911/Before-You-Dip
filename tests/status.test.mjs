import test from "node:test";
import assert from "node:assert/strict";
import {
  bacteriaComparison,
  describeCondition,
  isActiveAdvisory,
} from "../src/lib/status.ts";

const now = new Date("2026-07-19T12:00:00Z");
const base = {
  analyte: "E. coli",
  sampledAt: "2026-07-15T12:00:00Z",
  result: 80,
  thirtyDayGeoMean: 70,
  thirtyDayCount: 4,
  sixWeekGeoMean: 80,
  sixWeekCount: 5,
  unit: "MPN/100 mL",
  dataQuality: "Passed",
  dataSource: "CEDEN",
};

test("E. coli comparisons use freshwater screening lines", () => {
  assert.equal(bacteriaComparison(base).above, false);
  assert.equal(bacteriaComparison({ ...base, result: 321 }).above, true);
  assert.equal(bacteriaComparison({ ...base, sixWeekGeoMean: 101 }).above, true);
});

test("enterococcus uses its lower comparison lines", () => {
  const result = bacteriaComparison({ ...base, analyte: "Enterococcus", result: 111 });
  assert.equal(result.singleSampleLine, 110);
  assert.equal(result.geometricMeanLimit, 30);
  assert.equal(result.above, true);
});

test("an open meaningful algae advisory overrides bacteria results", () => {
  const bloom = {
    observedAt: "2026-07-10T12:00:00Z",
    advisory: "Warning",
    caseStatus: "Open",
    advisoryEnd: null,
    detail: "",
  };
  assert.equal(isActiveAdvisory(bloom, now), true);
  assert.equal(describeCondition([base], bloom, now).tone, "avoid");
});

test("a visual observation is not promoted to an official advisory", () => {
  const bloom = {
    observedAt: "2026-07-10T12:00:00Z",
    advisory: "Visual observation",
    caseStatus: "Open",
    advisoryEnd: null,
    detail: "",
  };
  assert.equal(isActiveAdvisory(bloom, now), false);
  assert.equal(describeCondition([base], bloom, now).tone, "caution");
  assert.equal(describeCondition([base], bloom, now).label, "Bloom under review");
});

test("old evidence is unknown rather than presented as safe", () => {
  const old = { ...base, sampledAt: "2025-01-01T12:00:00Z" };
  const result = describeCondition([old], null, now);
  assert.equal(result.tone, "unknown");
  assert.match(result.label, /No recent evidence/);
});
