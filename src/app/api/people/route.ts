import { adminDb, apiError, json, requireAdmin } from "@/lib/server";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const page = Math.max(
      1,
      Math.min(
        10000,
        Number(new URL(request.url).searchParams.get("page")) || 1,
      ),
    );
    const { data, error, count } = await adminDb()
      .from("person_summary")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range((page - 1) * 20, page * 20 - 1);
    if (error) throw error;
    return json({ people: data, count, page });
  } catch (error) {
    return apiError(error);
  }
}
