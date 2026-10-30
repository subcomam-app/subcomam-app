import { z } from "zod";
import { documentTypes, normalizeDocument } from "@/lib/domain";
import { countrySchema } from "@/lib/countries";
import { adminDb, apiError, json, readBody, requireStaff } from "@/lib/server";

export async function POST(request: Request) {
  try {
    await requireStaff();
    const input = z
      .object({
        type: z.enum(documentTypes),
        country: countrySchema,
        query: z
          .string()
          .trim()
          .min(2)
          .max(30)
          .regex(/^[a-zA-Z0-9.\s-]+$/)
          .transform(normalizeDocument),
      })
      .parse(await readBody(request));
    const { data, error } = await adminDb()
      .from("person_summary")
      .select("*")
      .eq("document_type", input.type)
      .eq("issuing_country", input.country)
      .like("document_number", `${input.query}%`)
      .order("document_number")
      .limit(8);
    if (error) throw error;
    return json({ people: data });
  } catch (error) {
    return apiError(error);
  }
}
