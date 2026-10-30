import { periodSchema } from "@/lib/admin-domain";
import { adminDb, apiError, json, requireAccount } from "@/lib/server";

export async function GET(request: Request) {
  try {
    const { user } = await requireAccount();
    const { from, to } = periodSchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const { data, error } = await adminDb().rpc("officer_statistics", {
      account_id: user.id,
      from_date: from,
      to_date: to,
    });
    if (error) throw error;
    return json({ statistics: data });
  } catch (error) {
    return apiError(error);
  }
}
