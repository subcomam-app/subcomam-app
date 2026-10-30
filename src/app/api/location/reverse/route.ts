import { addressFromPhoton, coordinatesSchema } from "@/lib/control-location";
import {
  apiError,
  HttpError,
  json,
  readBody,
  requireStaff,
} from "@/lib/server";

export async function POST(request: Request) {
  try {
    await requireStaff();
    const coordinates = coordinatesSchema.parse(await readBody(request));
    // Keep the provider replaceable. Only coordinates are sent, never account
    // details, identity documents, photographs or control records.
    const endpoint = new URL(
      process.env.PHOTON_REVERSE_URL || "https://photon.komoot.io/reverse",
    );
    if (endpoint.protocol !== "https:")
      throw new HttpError(
        503,
        "El servicio de direcciones no está disponible.",
      );
    endpoint.searchParams.set("lat", coordinates.latitude.toFixed(5));
    endpoint.searchParams.set("lon", coordinates.longitude.toFixed(5));
    endpoint.searchParams.set("limit", "3");
    endpoint.searchParams.set("radius", "0.2");
    let address: string | null = null;
    try {
      const response = await fetch(endpoint, {
        headers: {
          "User-Agent": "SUBCOMAM/1.0 (+https://subcomam-app.vercel.app)",
          "Accept-Language": "es-CL,es;q=0.9",
        },
        // Repeated lookups of the same position reuse public map data.
        next: { revalidate: 86400 },
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error("Geocoder unavailable");
      address = addressFromPhoton(await response.json());
    } catch {
      throw new HttpError(
        503,
        "No se pudo consultar la dirección. Reintenta o escríbela manualmente.",
      );
    }
    if (!address)
      throw new HttpError(
        404,
        "No se encontró una calle cercana. Escribe la dirección del control.",
      );
    return json({ address });
  } catch (error) {
    return apiError(error);
  }
}
