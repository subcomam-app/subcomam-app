import { z } from "zod";
import { adminDb, apiError, HttpError, requireStaff } from "@/lib/server";
import { PHOTO_BUCKET } from "@/lib/photo-policy";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireStaff();
    const id = z.uuid().parse((await context.params).id);
    const kind = z
      .enum(["person", "document"])
      .parse(new URL(request.url).searchParams.get("kind") || "person");
    const db = adminDb();
    let query = db
      .from("controls")
      .select("photo_path, document_photo_path")
      .eq("id", id);
    if (actor.role !== "admin") query = query.eq("created_by", actor.id);
    const record = await query.maybeSingle();
    if (record.error) throw record.error;
    const path =
      kind === "document"
        ? record.data?.document_photo_path
        : record.data?.photo_path;
    if (!path) throw new HttpError(404, "Este control no tiene fotografía.");
    const photo = await db.storage.from(PHOTO_BUCKET).download(path);
    if (photo.error || !photo.data)
      throw new HttpError(
        503,
        "No fue posible cargar la fotografía. Intenta nuevamente.",
      );
    return new Response(photo.data, {
      headers: {
        "Content-Type": "image/webp",
        "Content-Length": String(photo.data.size),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": "inline; filename=control.webp",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
