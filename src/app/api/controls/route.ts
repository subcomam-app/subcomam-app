import { z } from "zod";
import {
  identityDocumentDescription,
  personalSchema,
  registrationSchema,
} from "@/lib/domain";
import {
  adminDb,
  apiError,
  checkOrigin,
  HttpError,
  json,
  requireStaff,
} from "@/lib/server";
import { compressControlPhoto, PhotoError } from "@/lib/photo-compression";
import { PHOTO_BUCKET, PHOTO_UPLOAD_MAX_BYTES } from "@/lib/photo-policy";
import { controlAvailability } from "@/lib/control-interval";

export const runtime = "nodejs";

async function readControlForm(request: Request) {
  checkOrigin(request);
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.startsWith("multipart/form-data"))
    throw new HttpError(
      400,
      "Cada control requiere una foto actualizada. Recarga la página y adjúntala antes de guardar.",
    );
  const limit = PHOTO_UPLOAD_MAX_BYTES * 2 + 24000;
  if (Number(request.headers.get("content-length")) > limit)
    throw new HttpError(413, "La foto supera el límite de carga.");
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "Adjunta una foto de la persona.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new HttpError(413, "La foto supera el límite de carga.");
    }
    chunks.push(value);
  }
  try {
    return await new Response(Buffer.concat(chunks), {
      headers: { "Content-Type": contentType },
    }).formData();
  } catch {
    throw new HttpError(
      400,
      "La carga de la foto no es válida. Selecciónala nuevamente.",
    );
  }
}

export async function GET(request: Request) {
  try {
    const actor = await requireStaff();
    const params = new URL(request.url).searchParams;
    const personId = params.get("person_id");
    const page = Math.max(1, Math.min(10000, Number(params.get("page")) || 1));
    let query = adminDb()
      .from("controls")
      .select("*, persons(*)", { count: "exact" })
      .order("controlled_at", { ascending: false });
    if (actor.role !== "admin") query = query.eq("created_by", actor.id);
    if (personId) query = query.eq("person_id", z.uuid().parse(personId));
    const { data, error, count } = await query.range(
      (page - 1) * 20,
      page * 20 - 1,
    );
    if (error) throw error;
    return json({ controls: data, count, page });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireStaff();
    const form = await readControlForm(request);
    const payload = form.get("payload");
    if (typeof payload !== "string" || payload.length > 16000)
      throw new HttpError(400, "Los datos del control no son válidos.");
    const input = registrationSchema.parse(JSON.parse(payload));
    // Identity and rank always come from the authenticated account.
    const control = {
      ...input.control,
      officer: actor.name,
      art12bis: {
        ...input.control.art12bis,
        officer_grade: actor.officer_grade,
      },
    };
    const file = form.get("photo");
    if (!(file instanceof File) || !file.size)
      throw new HttpError(400, "Adjunta una foto actualizada de la persona.");
    if (form.get("photo_confirmed") !== "true")
      throw new HttpError(
        400,
        "Confirma que la foto corresponde a la persona en este control.",
      );
    const db = adminDb();
    const existing = await db
      .from("controls")
      .select("*")
      .eq("request_id", input.request_id)
      .maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) {
      if (existing.data.created_by !== actor.id)
        throw new HttpError(
          409,
          "Este identificador pertenece a otro control.",
        );
      return json({ control: existing.data }, 201);
    }
    const deleted = await db
      .from("control_deletions")
      .select("control_id")
      .eq("request_id", input.request_id)
      .maybeSingle();
    if (deleted.error) throw deleted.error;
    if (deleted.data) throw { code: "PT410" };
    if (input.person_id) {
      const person = await db
        .from("persons")
        .select("*")
        .eq("id", input.person_id)
        .maybeSingle();
      if (person.error) throw person.error;
      if (!person.data)
        throw new HttpError(
          404,
          "La persona seleccionada no existe. Vuelve a buscar su documento.",
        );
      // Older clients may omit contact only when the saved record is complete.
      personalSchema.parse({
        ...person.data,
        ...input.contact,
        ...input.person_details,
      });
      control.art12bis.presented_document = identityDocumentDescription(
        person.data,
      );
      const previous = await db
        .from("controls")
        .select("controlled_at")
        .eq("person_id", input.person_id)
        .order("controlled_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (previous.error) throw previous.error;
      const availability = controlAvailability(
        previous.data?.controlled_at || null,
      );
      if (!availability.can_control)
        throw { code: "PT409", details: JSON.stringify(availability) };
    } else if (input.identity) {
      control.art12bis.presented_document = identityDocumentDescription(
        input.identity,
      );
    }
    const documentFile = form.get("document_photo");
    if (
      documentFile !== null &&
      (!(documentFile instanceof File) || !documentFile.size)
    )
      throw new HttpError(
        400,
        "La imagen del documento adjunta no es válida. Selecciónala nuevamente o quítala para continuar.",
      );
    if (documentFile && form.get("document_photo_confirmed") !== "true")
      throw new HttpError(
        400,
        "Confirma que el documento corresponde a este control y que se lee claramente.",
      );
    if (
      file.size > PHOTO_UPLOAD_MAX_BYTES ||
      (documentFile && documentFile.size > PHOTO_UPLOAD_MAX_BYTES)
    )
      throw new HttpError(
        413,
        "Las imágenes superan el límite de carga. Vuelve a seleccionarlas para comprimirlas.",
      );
    const [photo, documentPhoto] = await Promise.all([
      file
        .arrayBuffer()
        .then((bytes) => compressControlPhoto(new Uint8Array(bytes))),
      documentFile
        ? documentFile
            .arrayBuffer()
            .then((bytes) =>
              compressControlPhoto(new Uint8Array(bytes), "document"),
            )
        : null,
    ]);
    // Each attempt owns its object, so a failed concurrent retry cannot delete the winner's photo.
    const path = `${input.request_id}/${crypto.randomUUID()}.webp`;
    const documentPath = documentPhoto
      ? `${input.request_id}/${crypto.randomUUID()}.webp`
      : null;
    const storage = db.storage.from(PHOTO_BUCKET);
    const ownUploads: string[] = [];
    const removeOwnUploads = async (
      keep: (string | null | undefined)[] = [],
    ) => {
      const paths = ownUploads.filter((upload) => !keep.includes(upload));
      if (!paths.length) return;
      const removed = await storage.remove(paths);
      if (removed.error)
        console.error("Photo cleanup failed", { code: removed.error.name });
    };
    const uploads = [{ path, bytes: photo.bytes }];
    if (documentPath && documentPhoto)
      uploads.push({ path: documentPath, bytes: documentPhoto.bytes });
    for (const { path: uploadPath, bytes } of uploads) {
      const uploaded = await storage.upload(uploadPath, bytes, {
        contentType: "image/webp",
        upsert: false,
        cacheControl: "0",
      });
      if (uploaded.error) {
        await removeOwnUploads();
        throw new HttpError(
          503,
          "No se pudieron guardar las imágenes. El control no se ha registrado; vuelve a intentarlo.",
        );
      }
      ownUploads.push(uploadPath);
    }
    const { data, error } = await db.rpc("register_control", {
      payload: {
        ...input,
        control,
        photo: {
          path,
          bytes: photo.bytes.byteLength,
          width: photo.width,
          height: photo.height,
        },
        document_photo: documentPhoto
          ? {
              path: documentPath,
              bytes: documentPhoto.bytes.byteLength,
              width: documentPhoto.width,
              height: documentPhoto.height,
            }
          : null,
      },
      actor_id: actor.id,
    });
    if (error) {
      // A PostgreSQL error confirms rollback. A lost response may have committed;
      // retain the object in that case so a saved control never loses its photo.
      if (
        /^[0-9A-Z]{5}$/.test(error.code || "") &&
        !error.code.startsWith("08")
      )
        await removeOwnUploads();
      else {
        const recovered = await db
          .from("controls")
          .select("*")
          .eq("request_id", input.request_id)
          .maybeSingle();
        if (recovered.data && recovered.data.created_by === actor.id) {
          await removeOwnUploads([
            recovered.data.photo_path,
            recovered.data.document_photo_path,
          ]);
          return json({ control: recovered.data }, 201);
        }
      }
      throw error;
    }
    await removeOwnUploads([data.photo_path, data.document_photo_path]);
    return json({ control: data }, 201);
  } catch (error) {
    if (error instanceof PhotoError) return json({ error: error.message }, 400);
    return apiError(error);
  }
}
