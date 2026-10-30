import { z } from "zod";
import { adminDb, apiError, HttpError, json, requireAdmin } from "@/lib/server";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
    const id = z.uuid().parse((await context.params).id);
    const page = z.coerce
      .number()
      .int()
      .min(1)
      .max(10000)
      .parse(new URL(request.url).searchParams.get("page") || 1);
    const db = adminDb();
    const account = await db.auth.admin.getUserById(id);
    if (account.error || !account.data.user)
      throw new HttpError(404, "La cuenta no existe.");
    const { data, count, error } = await db
      .from("user_access_events")
      .select("id, accessed_at, method, role", { count: "exact" })
      .eq("user_id", id)
      .order("accessed_at", { ascending: false })
      .order("id", { ascending: false })
      .range((page - 1) * 20, page * 20 - 1);
    if (error) throw error;
    return json({
      accesses: data,
      count,
      page,
      last_sign_in_at: account.data.user.last_sign_in_at || null,
    });
  } catch (error) {
    return apiError(error);
  }
}
