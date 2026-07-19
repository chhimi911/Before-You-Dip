import { getSourceSnapshot } from "@/lib/conditions";

const packages = [
  "surface-water-fecal-indicator-bacteria-results",
  "surface-water-freshwater-harmful-algal-blooms",
];

export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = getSourceSnapshot();
  try {
    const live = await Promise.all(
      packages.map(async (id) => {
        const response = await fetch(`https://data.ca.gov/api/3/action/package_show?id=${id}`, {
          signal: AbortSignal.timeout(6000),
          headers: { "User-Agent": "BeforeYouDip/1.0 public-data-prototype" },
        });
        if (!response.ok) throw new Error(`data.ca.gov returned ${response.status}`);
        const payload = await response.json();
        return {
          id,
          title: payload.result.title,
          modified: payload.result.metadata_modified,
          url: `https://data.ca.gov/dataset/${id}`,
        };
      }),
    );
    return Response.json({ status: "live", checkedAt: new Date().toISOString(), snapshot, live });
  } catch {
    return Response.json({
      status: "snapshot",
      checkedAt: new Date().toISOString(),
      snapshot,
      message: "Live source check was unavailable; the packaged snapshot remains available.",
    });
  }
}

