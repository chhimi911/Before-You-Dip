import { getConditions } from "@/lib/conditions";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const parameters = new URL(request.url).searchParams;
  const latitudeValue = parameters.get("lat");
  const longitudeValue = parameters.get("lon");
  const limitValue = parameters.get("limit");
  const latitude = latitudeValue === null ? undefined : Number(latitudeValue);
  const longitude = longitudeValue === null ? undefined : Number(longitudeValue);
  const limit = limitValue === null ? undefined : Number(limitValue);

  return Response.json(
    getConditions({
      query: parameters.get("query") ?? "",
      latitude: Number.isFinite(latitude) ? latitude : undefined,
      longitude: Number.isFinite(longitude) ? longitude : undefined,
      limit: Number.isFinite(limit) ? limit : undefined,
    }),
    { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=3600" } },
  );
}
