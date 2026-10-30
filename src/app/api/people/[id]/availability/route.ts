import { z } from "zod";
import { adminDb, apiError, HttpError, json, requireStaff } from "@/lib/server";
import { controlAvailability } from "@/lib/control-interval";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireStaff();
    const id = z.uuid().parse((await context.params).id);
    const { data, error } = await adminDb()
      .from("person_summary")
      .select("last_control_at")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new HttpError(404, "La persona seleccionada no existe.");
    return json({ availability: controlAvailability(data.last_control_at) });
  } catch (error) {
    return apiError(error);
  }
}
