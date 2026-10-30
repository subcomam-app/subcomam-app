import { adminDb, apiError, json, requireAccount } from "@/lib/server";

export async function GET() {
  try {
    const { user } = await requireAccount();
    const { data, error } = await adminDb().rpc("control_period_statistics", {
      account_id: user.id,
    });
    if (error) throw error;
    return json({ summary: data });
  } catch (error) {
    return apiError(error);
  }
}
