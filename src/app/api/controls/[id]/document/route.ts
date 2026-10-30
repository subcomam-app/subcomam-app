import { z } from "zod";
import { adminDb, apiError, HttpError, requireStaff } from "@/lib/server";
import {
  controlDocumentFilename,
  DOCX_MIME,
  generateControlDocument,
} from "@/lib/control-document";
import type { Control } from "@/lib/domain";
import { generateControlPdf } from "@/lib/control-pdf";
import { actaImage } from "@/lib/control-image-assets";
import { PHOTO_BUCKET } from "@/lib/photo-policy";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireStaff();
    const format = z
      .enum(["docx", "pdf"])
      .parse(new URL(request.url).searchParams.get("format") || "docx");
    const id = z.uuid().parse((await params).id);
    const db = adminDb();
    let query = db.from("controls").select("*").eq("id", id);
    if (actor.role !== "admin") query = query.eq("created_by", actor.id);
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    if (!data) throw new HttpError(404, "No se encontró el control.");
    if (!data.art12bis)
      throw new HttpError(
        404,
        "Este control no corresponde al artículo 12 bis.",
      );
    const control = data as Control;
    const loadImage = async (path: string | null | undefined) => {
      if (!path) return undefined;
      const result = await db.storage.from(PHOTO_BUCKET).download(path);
      if (result.error || !result.data)
        throw new HttpError(
          503,
          "No se pudieron recuperar las imágenes del control. Reintenta la descarga del acta.",
        );
      return actaImage(new Uint8Array(await result.data.arrayBuffer()));
    };
    const [person, document] = await Promise.all([
      loadImage(control.photo_path),
      loadImage(control.document_photo_path),
    ]);
    const bytes =
      format === "pdf"
        ? await generateControlPdf(control, { person, document })
        : await generateControlDocument(control, { person, document });
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": format === "pdf" ? "application/pdf" : DOCX_MIME,
        "Content-Disposition": `attachment; filename="${controlDocumentFilename(control).replace(/\.docx$/, `.${format}`)}"`,
        "Cache-Control": "no-store, private",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
