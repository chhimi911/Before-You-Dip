import { readFile } from "node:fs/promises";
import path from "node:path";

const dataDirectory = path.join(process.cwd(), "src", "data");

async function json(name) {
  return JSON.parse(await readFile(path.join(dataDirectory, name), "utf8"));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function validCaliforniaPoint(record) {
  return record.latitude >= 32 && record.latitude <= 42.2 && record.longitude >= -124.7 && record.longitude <= -114;
}

const [fib, hab, metadata] = await Promise.all([
  json("fib-latest.json"),
  json("hab-latest.json"),
  json("source-metadata.json"),
]);

const generatedAt = new Date(metadata.generatedAt).valueOf();
const maximumFutureTime = Date.now() + 24 * 60 * 60 * 1000;
assert(Number.isFinite(generatedAt) && generatedAt <= maximumFutureTime, "Snapshot generation time is invalid or in the future.");
assert(fib.generatedAt === metadata.generatedAt && hab.generatedAt === metadata.generatedAt, "Snapshot files were not generated together.");
assert(fib.records.length >= 1_000, `Unexpectedly small bacteria snapshot: ${fib.records.length}`);
assert(hab.records.length >= 1_000, `Unexpectedly small algae snapshot: ${hab.records.length}`);
assert(fib.records.every(validCaliforniaPoint), "Bacteria snapshot contains an invalid California coordinate.");
assert(hab.records.every(validCaliforniaPoint), "Algae snapshot contains an invalid California coordinate.");
assert(fib.records.every((record) => new Date(record.sampledAt).valueOf() <= maximumFutureTime), "Bacteria snapshot contains a future sample.");
assert(hab.records.every((record) => new Date(record.observedAt).valueOf() <= maximumFutureTime), "Algae snapshot contains a future observation.");
assert(metadata.packages.fib.resource.hash, "Bacteria source hash is missing.");
assert(metadata.packages.hab.resource.hash, "Algae source hash is missing.");

console.log(`Verified ${fib.records.length} bacteria records and ${hab.records.length} algae records.`);
console.log(`Snapshot generated ${metadata.generatedAt}.`);

