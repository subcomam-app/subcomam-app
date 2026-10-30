import { adminDb, apiError, json, requireAdmin } from "@/lib/server";
import { periodSchema } from "@/lib/admin-domain";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const { from, to } = periodSchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const { data, error } = await adminDb().rpc("admin_statistics", {
      from_date: from,
      to_date: to,
    });
    if (error) throw error;
    return json({ statistics: data });
  } catch (error) {
    return apiError(error);
  }
}
