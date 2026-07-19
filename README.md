# Before You Dip

Before You Dip is an independent California public-data project. It brings fecal-indicator bacteria monitoring results and freshwater harmful-algae reports into one evidence-first interface for people and dog owners.

It is not affiliated with, endorsed by, or speaking for the State of California or any public agency. It does not certify water as safe. Local signs, advisories, health departments, and park authorities remain authoritative.

## Run locally

```bash
npm install
npm run dev
```

Open <http://localhost:3000>.

## Refresh the public-data snapshot

```bash
npm run fetch:data
```

The refresh script calls the California Open Data CKAN API to discover the current CSV resources. It compares the official resource hashes first and skips the large download when neither source changed. When a source changes, it streams the bacteria dataset, keeps the latest E. coli and Enterococcus evidence per station, validates dates and California coordinates, and atomically replaces the compact JSON snapshots in `src/data/`.

No API key or environment file is required.

The checked-in GitHub Actions workflow runs this refresh once per day at 14:17 UTC and can also be started manually. It validates the new snapshot, runs the full application checks, and publishes a data-only commit only when the source files changed. A connected hosting service can redeploy from that commit. Until this project is pushed to GitHub and Actions is enabled, refreshes remain manual.

The app is not real-time. It shows both the time the packaged snapshot was created and the newest source-file modification included in that snapshot. The live catalog button checks data.ca.gov metadata; it does not silently replace the packaged results.

## Verification

```bash
npm test
npm run verify:data
npm run lint
npm run typecheck
npm run build
```

## Data and method

- [Fecal Indicator Bacteria Monitoring Results](https://data.ca.gov/dataset/surface-water-fecal-indicator-bacteria-results)
- [Freshwater Harmful Algal Bloom Reports](https://data.ca.gov/dataset/surface-water-freshwater-harmful-algal-blooms)
- [California Statewide Bacteria Objectives](https://www.waterboards.ca.gov/bacterialobjectives/)

The interface uses plain-language evidence states: advisory posted, bloom under review, recent result above objective, recent result below objective, and no recent evidence. Older results become unknown; missing data never becomes a green light.

## Visual assets

All custom artwork was generated as raster PNG files with OpenAI ImageGen and is stored in `public/assets/`. The project contains no SVG files and uses no SVG icon library.
