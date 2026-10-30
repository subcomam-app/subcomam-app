import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { compressControlPhoto, PhotoError } from "../src/lib/photo-compression";
import { PHOTO_MAX_BYTES, PHOTO_TARGET_BYTES } from "../src/lib/photo-policy";

test("La foto se orienta, reduce a WebP y pierde sus metadatos", async () => {
  const input = await sharp({
    create: { width: 1600, height: 1200, channels: 3, background: "#246347" },
  })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer();
  const photo = await compressControlPhoto(input);
  const meta = await sharp(photo.bytes).metadata();
  assert.equal(meta.format, "webp");
  assert.equal(photo.width, 480);
  assert.equal(photo.height, 640);
  assert.ok(photo.bytes.length <= PHOTO_TARGET_BYTES);
  assert.equal(meta.exif, undefined);
  assert.equal(meta.icc, undefined);
  assert.equal(meta.orientation, undefined);
});
test("Se rechazan archivos falsos, excesivos y fotos demasiado pequeñas", async () => {
  await assert.rejects(
    compressControlPhoto(Buffer.from("not an image")),
    PhotoError,
  );
  await assert.rejects(
    compressControlPhoto(Buffer.alloc(1024 * 1024 + 1)),
    PhotoError,
  );
  const small = await sharp({
    create: { width: 100, height: 100, channels: 3, background: "#fff" },
  })
    .jpeg()
    .toBuffer();
  await assert.rejects(compressControlPhoto(small), PhotoError);
});
test("La compresión adaptativa limita una imagen de alta complejidad", async () => {
  const { randomBytes } = await import("node:crypto");
  const input = await sharp(randomBytes(640 * 640 * 3), {
    raw: { width: 640, height: 640, channels: 3 },
  })
    .jpeg({ quality: 85 })
    .toBuffer();
  const photo = await compressControlPhoto(input);
  assert.ok(photo.bytes.length <= PHOTO_MAX_BYTES);
  assert.ok(photo.width <= 640 && photo.height <= 640);
});
