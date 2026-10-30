import { adminDb, apiError, json, requireAdmin } from "@/lib/server";

export async function GET() {
  try {
    await requireAdmin();
    const { data, error } = await adminDb().rpc("control_period_statistics");
    if (error) throw error;
    return json({ summary: data });
  } catch (error) {
    return apiError(error);
  }
}
