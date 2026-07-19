import { getLiveConditions } from "@/lib/live-conditions";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const parameters = new URL(request.url).searchParams;
  const latitudeValue = parameters.get("lat");
  const longitudeValue = parameters.get("lon");
  const limitValue = parameters.get("limit");
  const latitude = latitudeValue === null ? undefined : Number(latitudeValue);
  const longitude = longitudeValue === null ? undefined : Number(longitudeValue);
  const limit = limitValue === null ? undefined : Number(limitValue);

  const conditions = await getLiveConditions({
      query: parameters.get("query") ?? "",
      label: parameters.get("label") ?? "",
      latitude: Number.isFinite(latitude) ? latitude : undefined,
      longitude: Number.isFinite(longitude) ? longitude : undefined,
      limit: Number.isFinite(limit) ? limit : undefined,
    });

  return Response.json(conditions, { headers: { "Cache-Control": "no-store" } });
}
