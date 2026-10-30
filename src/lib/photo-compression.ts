import sharp from "sharp";
import {
  PHOTO_UPLOAD_MAX_BYTES,
  photoPolicy,
  type PhotoKind,
} from "./photo-policy";

export class PhotoError extends Error {}

export async function compressControlPhoto(
  input: Uint8Array,
  kind: PhotoKind = "person",
) {
  const policy = photoPolicy(kind);
  if (!input.byteLength || input.byteLength > PHOTO_UPLOAD_MAX_BYTES)
    throw new PhotoError(
      "La foto supera el límite de carga. Vuelve a seleccionarla para comprimirla.",
    );
  try {
    const image = sharp(input, {
      limitInputPixels: 30_000_000,
      failOn: "warning",
    });
    const metadata = await image.metadata();
    if (
      !["jpeg", "png", "webp"].includes(metadata.format || "") ||
      (metadata.pages || 1) > 1
    )
      throw new PhotoError("Usa una fotografía JPG, PNG o WebP sin animación.");
    if (
      !metadata.width ||
      !metadata.height ||
      Math.min(metadata.width, metadata.height) < policy.minEdge ||
      Math.max(metadata.width, metadata.height) /
        Math.min(metadata.width, metadata.height) >
        3
    )
      throw new PhotoError(
        kind === "document"
          ? "La imagen del documento debe tener al menos 400 píxeles por lado y ser legible."
          : "La foto debe tener al menos 240 píxeles por lado y mostrar el rostro con claridad.",
      );
    // Auto-orient before removing EXIF/GPS; metadata is stripped by default.
    const normalized = await image
      .rotate()
      .resize({
        width: policy.steps[0][0],
        height: policy.steps[0][0],
        fit: "inside",
        withoutEnlargement: true,
      })
      .flatten({ background: "#ffffff" })
      .png()
      .toBuffer();
    let result;
    for (const [edge, quality] of policy.steps) {
      result = await sharp(normalized)
        .resize({
          width: edge,
          height: edge,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality, effort: 6 })
        .toBuffer({ resolveWithObject: true });
      if (result.data.byteLength <= policy.targetBytes) break;
    }
    if (!result || result.data.byteLength > policy.maxBytes)
      throw new PhotoError(
        kind === "document"
          ? "No se pudo comprimir el documento. Acércalo a la cámara y usa buena iluminación."
          : "No se pudo reducir la foto lo suficiente. Toma otra con el rostro más cerca y un fondo simple.",
      );
    return {
      bytes: result.data,
      width: result.info.width,
      height: result.info.height,
    };
  } catch (error) {
    if (error instanceof PhotoError) throw error;
    throw new PhotoError(
      "No se pudo leer la fotografía. Selecciona un archivo JPG, PNG o WebP válido.",
    );
  }
}
