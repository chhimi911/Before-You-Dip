export const dynamic = "force-dynamic";

type NominatimResult = {
  lat: string;
  lon: string;
  display_name: string;
  address?: { state?: string; "ISO3166-2-lvl4"?: string };
};

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("query")?.trim() ?? "";
  if (query.length < 3 || query.length > 200) {
    return Response.json({ message: "Enter a California ZIP code or address." }, { status: 400 });
  }

  const baseUrl = process.env.GEOCODER_BASE_URL || "https://nominatim.openstreetmap.org";
  const url = new URL("/search", baseUrl);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("q", `${query}, California`);
  url.searchParams.set("countrycodes", "us");
  url.searchParams.set("viewbox", "-124.7,42.2,-114,32");
  url.searchParams.set("bounded", "1");
  url.searchParams.set("limit", "1");
  url.searchParams.set("addressdetails", "1");

  try {
    const response = await fetch(url, {
      headers: {
        "Accept-Language": "en-US,en;q=0.8",
        "User-Agent": "BeforeYouDip/1.0 (+https://github.com/chhimi911/Before-You-Dip)",
      },
      next: { revalidate: 86_400 },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Geocoder returned ${response.status}`);
    const [match] = await response.json() as NominatimResult[];
    if (!match) return Response.json({ message: "No California location matched that ZIP code or address." }, { status: 404 });

    const latitude = Number(match.lat);
    const longitude = Number(match.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < 32 || latitude > 42.2 || longitude < -124.7 || longitude > -114) {
      return Response.json({ message: "That location is outside California." }, { status: 404 });
    }

    return Response.json(
      { latitude, longitude, label: match.display_name, attribution: "© OpenStreetMap contributors" },
      { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } },
    );
  } catch {
    return Response.json({ message: "Location lookup is temporarily unavailable. Try a water-body name or use your browser location." }, { status: 503 });
  }
}
