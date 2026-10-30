import { z } from "zod";

export const coordinatesSchema = z
  .object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  })
  .strict();

const featureSchema = z.object({
  properties: z.object({
    street: z.string().optional(),
    housenumber: z.string().optional(),
    name: z.string().optional(),
    osm_key: z.string().optional(),
    district: z.string().optional(),
    city: z.string().optional(),
    county: z.string().optional(),
    state: z.string().optional(),
  }),
});

export function addressFromPhoton(body: unknown): string | null {
  const response = z.object({ features: z.array(z.unknown()) }).safeParse(body);
  if (!response.success) return null;
  for (const candidate of response.data.features) {
    const feature = featureSchema.safeParse(candidate);
    if (!feature.success) continue;
    const p = feature.data.properties;
    const street = p.street || (p.osm_key === "highway" ? p.name : "");
    // A city or a nearby business alone is not a control address.
    if (!street?.trim()) continue;
    const parts = [
      [street, p.housenumber].filter(Boolean).join(" "),
      p.district,
      p.city || p.county,
      p.state,
    ].filter((part): part is string => !!part?.trim());
    return [...new Set(parts.map((part) => part.trim()))]
      .join(", ")
      .slice(0, 200);
  }
  return null;
}
