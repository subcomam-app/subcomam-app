import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cameraErrorMessage,
  captureCameraPhoto,
  openRearCamera,
  stopCamera,
} from "../src/lib/rear-camera";

function media(facingMode: string | undefined = "environment") {
  let stopped = false;
  const track = {
    getSettings: () => ({ facingMode }),
    stop: () => {
      stopped = true;
    },
  };
  const stream = {
    getTracks: () => [track],
    getVideoTracks: () => [track],
  } as unknown as MediaStream;
  return { stream, stopped: () => stopped };
}

test("La captura requiere cámara trasera y nunca solicita micrófono", async () => {
  const rear = media();
  let requested: MediaStreamConstraints | undefined;
  const stream = await openRearCamera({
    getSupportedConstraints: () => ({ facingMode: true }),
    getUserMedia: async (constraints) => {
      requested = constraints;
      return rear.stream;
    },
  });
  assert.equal(requested?.audio, false);
  assert.deepEqual((requested?.video as MediaTrackConstraints).facingMode, {
    exact: "environment",
  });
  assert.equal(stream, rear.stream);
  assert.equal(rear.stopped(), false);
  stopCamera(stream);
  assert.equal(rear.stopped(), true);
});

test("Si el teléfono solo ofrece cámara selfie no se reintenta con otra cámara", async () => {
  let calls = 0;
  await assert.rejects(
    openRearCamera({
      getSupportedConstraints: () => ({ facingMode: true }),
      getUserMedia: async () => {
        calls++;
        throw new DOMException("No rear camera", "OverconstrainedError");
      },
    }),
    { name: "OverconstrainedError" },
  );
  assert.equal(calls, 1);
});

test("No abre una cámara si el navegador no puede exigir orientación trasera", async () => {
  let calls = 0;
  await assert.rejects(
    openRearCamera({
      getSupportedConstraints: () => ({}),
      getUserMedia: async () => {
        calls++;
        return media().stream;
      },
    }),
    /cámara trasera/,
  );
  assert.equal(calls, 0);
  await assert.rejects(openRearCamera(undefined), /cámara trasera/);
});

test("Detiene cualquier cámara frontal devuelta por un navegador que ignore la restricción", async () => {
  const selfie = media("user");
  await assert.rejects(
    openRearCamera({
      getSupportedConstraints: () => ({ facingMode: true }),
      getUserMedia: async () => selfie.stream,
    }),
    /cámara trasera/,
  );
  assert.equal(selfie.stopped(), true);
});

test("No captura un fotograma negro mientras la cámara aún está abriendo", async () => {
  await assert.rejects(
    captureCameraPhoto({
      readyState: 1,
      videoWidth: 0,
      videoHeight: 0,
    } as HTMLVideoElement),
    /Espera a que se vea la imagen/,
  );
});

test("Los errores de permiso y cámara ocupada permiten recuperarse sin abrir selfies", () => {
  assert.match(
    cameraErrorMessage(new DOMException("", "NotAllowedError")),
    /Permite el acceso/,
  );
  assert.match(
    cameraErrorMessage(new DOMException("", "NotReadableError")),
    /ocupada/,
  );
  assert.match(
    cameraErrorMessage(new DOMException("", "NotFoundError")),
    /cámara trasera/,
  );
});
