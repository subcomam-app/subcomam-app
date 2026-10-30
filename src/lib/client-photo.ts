import { PHOTO_MAX_EDGE, photoPolicy, type PhotoKind } from "./photo-policy";

async function readPhoto(file: File) {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, {
        imageOrientation: "from-image",
      });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      };
    } catch {
      // Some mobile browsers decode a camera file only through an image element.
    }
  }
  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = reject;
      image.src = url;
    });
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    };
  } catch {
    URL.revokeObjectURL(url);
    throw new Error(
      "No se pudo abrir la foto. Prueba con una imagen JPG, PNG o WebP.",
    );
  }
}

/** Shared by camera capture and file selection; the original never gets uploaded. */
export async function prepareControlPhoto(
  file: File,
  kind: PhotoKind = "person",
): Promise<Blob> {
  const policy = photoPolicy(kind);
  if (!file.size || file.size > 20 * 1024 * 1024)
    throw new Error("Selecciona una fotografía de hasta 20 MB.");
  if (
    file.type &&
    !["image/jpeg", "image/png", "image/webp"].includes(file.type)
  )
    throw new Error(
      "Usa JPG, PNG o WebP. Convierte las fotos HEIC a JPG antes de adjuntarlas.",
    );

  const image = await readPhoto(file);
  const canvas = document.createElement("canvas");
  try {
    const longest = Math.max(image.width, image.height);
    const shortest = Math.min(image.width, image.height);
    if (image.width * image.height > 30_000_000)
      throw new Error(
        "La fotografía supera los 30 megapíxeles. Selecciona una de menor resolución.",
      );
    if (shortest < policy.minEdge || longest / shortest > 3)
      throw new Error(
        kind === "document"
          ? "Usa una imagen de al menos 400 píxeles por lado, con todo el documento legible."
          : "Usa una foto de al menos 240 píxeles por lado, con el rostro visible.",
      );
    const context = canvas.getContext("2d");
    if (!context)
      throw new Error("No se pudo preparar la foto en este navegador.");

    let format = "image/webp";
    let smallest: Blob | null = null;
    for (const [edge, quality] of kind === "document"
      ? policy.steps.map(([edge, quality]) => [edge, quality / 100])
      : [
          [PHOTO_MAX_EDGE, 0.72],
          [PHOTO_MAX_EDGE, 0.55],
          [512, 0.5],
          [480, 0.4],
        ]) {
      // Keep the short side valid for the server; do not upscale small originals.
      const scale = Math.min(
        1,
        Math.max(edge / longest, policy.minEdge / shortest),
      );
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image.source, 0, 0, canvas.width, canvas.height);
      const encode = (type: string) =>
        new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, type, quality),
        );
      let blob = await encode(format);
      // Browsers without WebP encoding silently return PNG. JPEG still compresses
      // before upload; the server always stores its validated WebP version.
      if (format === "image/webp" && blob?.type !== "image/webp") {
        format = "image/jpeg";
        blob = await encode(format);
      }
      if (!blob?.size || blob.type !== format)
        throw new Error(
          "No se pudo comprimir la fotografía en este navegador. Intenta nuevamente.",
        );
      if (!smallest || blob.size < smallest.size) smallest = blob;
      if (smallest.size <= policy.targetBytes) return smallest;
    }
    if (smallest && smallest.size <= policy.maxBytes) return smallest;
    throw new Error(
      kind === "document"
        ? "No se pudo comprimir el documento. Acércalo a la cámara y usa buena iluminación."
        : "No se pudo reducir la foto lo suficiente. Toma otra con el rostro más cerca y un fondo simple.",
    );
  } finally {
    image.release();
    canvas.width = canvas.height = 0;
  }
}

export function photoFileName(photo: Blob) {
  return photo.type === "image/jpeg" ? "foto.jpg" : "foto.webp";
}
