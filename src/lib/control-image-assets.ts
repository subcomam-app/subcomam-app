import sharp from "sharp";

export type ActaImage = { bytes: Uint8Array; width: number; height: number };
export type ControlImages = { person?: ActaImage; document?: ActaImage };

// PDF and Word embed JPEG; source WebP stays compressed and private in Storage.
export async function actaImage(bytes: Uint8Array): Promise<ActaImage> {
  const image = await sharp(bytes, { limitInputPixels: 30_000_000 })
    .rotate()
    .flatten({ background: "#fff" })
    .jpeg({ quality: 90 })
    .toBuffer({ resolveWithObject: true });
  return {
    bytes: image.data,
    width: image.info.width,
    height: image.info.height,
  };
}

export function imageFit(image: ActaImage, width: number, height: number) {
  const scale = Math.min(width / image.width, height / image.height);
  return { width: image.width * scale, height: image.height * scale };
}
