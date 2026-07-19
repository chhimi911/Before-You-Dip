# Codex build prompt — Before You Dip

Build a complete, responsive Next.js App Router application called **Before You Dip**. It must be an independent public-data project, never use an official department title, and never imply that its creator works for or represents a California agency.

The public need is a single evidence-first place to check recent bacteria monitoring and freshwater harmful-algae reports before a person or dog enters a California lake, river, reservoir, or swimming hole. The app must not promise that water is safe. Use transparent states such as “Advisory posted,” “Recent result above objective,” “Recent result below objective,” and “No recent evidence.” Show dates, measurements, comparison logic, source links, and caveats.

Use the California Open Data CKAN `package_show` API to discover current resources for:

- `surface-water-fecal-indicator-bacteria-results`
- `surface-water-freshwater-harmful-algal-blooms`

Because the bacteria CSV is very large, add a reproducible streaming refresh script that builds a compact bundled snapshot instead of downloading hundreds of megabytes per page request. Add API routes for condition search, nearby search, and a live source-catalog check. Validate malformed dates and coordinates. Include automated tests for the decision rules.

Create every custom visual with ImageGen and save it as a PNG. Do not create or ship SVG files, use SVG icons, or install an icon library. The art direction is sophisticated California editorial illustration: deep teal, lake blue, sunlit sand, muted coral, tactile paper grain, confident typography, and generous spacing. Build a hero, illustrated exploration map, search/empty state, people-versus-dogs guidance toggle, evidence cards, a detailed evidence drawer, method section, and public-data source ledger. Make all search, location, saved-place, filter, and source-check interactions work on desktop and mobile.

Before completion, run tests, lint, type checking, production build, a local API smoke test, and a browser-based visual check at desktop and mobile widths. Confirm there are no `.svg` files in the project. Do not deploy, commit, or push unless explicitly asked.

