import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { prepareControlPhoto, photoFileName } from "../src/lib/client-photo";
import {
  PHOTO_MAX_BYTES,
  PHOTO_MIN_EDGE,
  PHOTO_TARGET_BYTES,
} from "../src/lib/photo-policy";

function browser(
  t: TestContext,
  encode: (type: string, quality: number) => Blob | null,
  width = 3000,
  height = 4000,
) {
  const originalBitmap = Object.getOwnPropertyDescriptor(
    globalThis,
    "createImageBitmap",
  );
  const originalDocument = Object.getOwnPropertyDescriptor(
    globalThis,
    "document",
  );
  let closed = false;
  const drawn: number[][] = [];
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({
      fillStyle: "",
      fillRect() {},
      drawImage() {
        drawn.push([canvas.width, canvas.height]);
      },
    }),
    toBlob(
      callback: (blob: Blob | null) => void,
      type: string,
      quality: number,
    ) {
      callback(encode(type, quality));
    },
  };
  Object.defineProperty(globalThis, "createImageBitmap", {
    configurable: true,
    value: async () => ({
      width,
      height,
      close() {
        closed = true;
      },
    }),
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { createElement: () => canvas },
  });
  t.after(() => {
    for (const [key, descriptor] of [
      ["createImageBitmap", originalBitmap],
      ["document", originalDocument],
    ] as const) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  });
  return {
    drawn,
    released: () => closed && canvas.width === 0 && canvas.height === 0,
  };
}

const file = () =>
  new File([new Uint8Array(2 * 1024 * 1024)], "captura.jpg", {
    type: "image/jpeg",
  });

test("La compresión se adapta al peso y libera los recursos de la cámara", async (t) => {
  const state = browser(
    t,
    (type, quality) =>
      new Blob([new Uint8Array(quality > 0.6 ? 150000 : 45000)], { type }),
  );
  const result = await prepareControlPhoto(file());
  assert.ok(result.size <= PHOTO_TARGET_BYTES);
  assert.equal(result.type, "image/webp");
  assert.ok(state.drawn.length > 1);
  assert.ok(
    state.drawn.every(([width, height]) => Math.max(width, height) <= 640),
  );
  assert.ok(state.released());
});

test("Si el navegador no codifica WebP, envía JPEG comprimido con nombre correcto", async (t) => {
  browser(t, (type) =>
    type === "image/webp"
      ? new Blob([new Uint8Array(400000)], { type: "image/png" })
      : new Blob([new Uint8Array(50000)], { type: "image/jpeg" }),
  );
  const result = await prepareControlPhoto(file());
  assert.equal(result.type, "image/jpeg");
  assert.ok(result.size <= PHOTO_MAX_BYTES);
  assert.equal(photoFileName(result), "foto.jpg");
});

test("Nunca envía el original si falla la compresión o sigue siendo demasiado grande", async (t) => {
  const state = browser(
    t,
    (type) => new Blob([new Uint8Array(PHOTO_MAX_BYTES + 1)], { type }),
  );
  await assert.rejects(prepareControlPhoto(file()), /No se pudo reducir/);
  assert.ok(state.released());
});

test("Las fotos alargadas conservan un lado corto válido y no se amplían originales pequeños", async (t) => {
  const state = browser(
    t,
    (type) => new Blob([new Uint8Array(5000)], { type }),
    240,
    720,
  );
  await prepareControlPhoto(file());
  assert.ok(
    state.drawn.every(
      ([width, height]) =>
        Math.min(width, height) >= PHOTO_MIN_EDGE &&
        width <= 240 &&
        height <= 720,
    ),
  );
});
