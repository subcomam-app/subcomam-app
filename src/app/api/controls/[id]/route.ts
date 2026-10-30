import { z } from "zod";
import {
  adminDb,
  apiError,
  checkOrigin,
  HttpError,
  json,
  requireAdmin,
} from "@/lib/server";
import { PHOTO_BUCKET } from "@/lib/photo-policy";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireAdmin();
    checkOrigin(request);
    const id = z.uuid().parse((await context.params).id);
    const db = adminDb();
    const { data, error } = await db.rpc("delete_control_for_correction", {
      target_id: id,
      administrator_id: actor.id,
    });
    if (error) throw error;
    // The private receipt survives network failures, so repeating DELETE also
    // retries image cleanup without affecting the person or a replacement control.
    if (!data.storage_cleaned_at) {
      const paths: string[] = data.photo_paths;
      if (paths.length) {
        const removed = await db.storage.from(PHOTO_BUCKET).remove(paths);
        if (removed.error) {
          console.error("Deleted control image cleanup failed", {
            code: removed.error.name,
          });
          throw new HttpError(
            503,
            "El control ya fue eliminado, pero falta retirar sus imágenes. Pulsa Eliminar nuevamente para completar la limpieza.",
          );
        }
      }
      const completed = await db
        .from("control_deletions")
        .update({ storage_cleaned_at: new Date().toISOString() })
        .eq("control_id", id);
      if (completed.error) throw completed.error;
    }
    return json({ deleted: true });
  } catch (error) {
    return apiError(error);
  }
}
